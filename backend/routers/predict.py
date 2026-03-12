"""
POST /predict

Accepts a PatientInput, runs the ML pipeline, computes SHAP for that patient,
returns risk probability, prediction, SHAP top-10, ICD-9 labels, and logs to SQLite.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from scipy.sparse import csr_matrix, hstack

from backend.core import model_loader as ml
from backend.core.audit_logger import log_prediction
from backend.core.icd9_utils import icd9_lookup

router = APIRouter()

NUMERIC_COLS = ml.NUMERIC_COLS


class PatientInput(BaseModel):
    diag_1: str = Field("428.0",  description="Primary ICD-9 diagnosis code")
    diag_2: str = Field("250.43", description="Secondary ICD-9 diagnosis code")
    diag_3: str = Field("585.6",  description="Tertiary ICD-9 diagnosis code")
    num_medications:   float = Field(15, ge=0, description="Number of distinct medications")
    total_visits:      float = Field(3,  ge=0, description="Total prior visits (out+ER+in)")
    time_in_hospital:  float = Field(4,  ge=1, le=14, description="Days in hospital (1–14)")
    num_lab_procedures: float = Field(40, ge=0, description="Number of lab procedures")
    threshold:         float = Field(0.32, ge=0.01, le=0.99, description="Decision threshold")
    session_id:        str   = Field("", description="Optional session ID for audit log")


class ShapEntry(BaseModel):
    feature: str
    shap_value: float
    raw_value: float


class PredictResponse(BaseModel):
    probability:          float
    prediction:           int
    risk_label:           str
    threshold:            float
    recall_at_threshold:  float
    precision_at_threshold: float
    shap_top10:           list[ShapEntry]
    icd9_labels:          dict[str, str]
    audit_id:             int


@router.post("/predict", response_model=PredictResponse)
def predict(patient: PatientInput) -> PredictResponse:
    if ml.MODEL is None:
        raise HTTPException(503, "Model not loaded — run train_model.py first.")

    # ── ICD-9 labels ──────────────────────────────────────────────────────────
    icd9_labels = {
        patient.diag_1: icd9_lookup(patient.diag_1),
        patient.diag_2: icd9_lookup(patient.diag_2),
        patient.diag_3: icd9_lookup(patient.diag_3),
    }
    diag_text = " ".join(
        icd9_lookup(c)
        for c in [patient.diag_1, patient.diag_2, patient.diag_3]
        if c not in ("nan", "", "None")
    )

    # ── feature matrix ────────────────────────────────────────────────────────
    text_v = ml.TFIDF.transform([diag_text])
    num_df = pd.DataFrame(
        [[patient.total_visits, patient.num_medications,
          patient.time_in_hospital, patient.num_lab_procedures]],
        columns=NUMERIC_COLS,
    )
    num_v = csr_matrix(ml.SCALER.transform(num_df))
    X = hstack([text_v, num_v])

    # ── prediction ────────────────────────────────────────────────────────────
    probability = float(ml.MODEL.predict_proba(X)[0, 1])
    prediction  = int(probability > patient.threshold)
    # HIGH only when probability is meaningfully above threshold (≥10 pp margin),
    # so the label actually changes across preset buttons.
    if probability >= patient.threshold:
        risk_label = "HIGH" if probability >= patient.threshold + 0.10 else "MEDIUM"
    else:
        risk_label = "MEDIUM" if probability >= patient.threshold * 0.75 else "LOW"

    # ── SHAP ──────────────────────────────────────────────────────────────────
    shap_values = ml.EXPLAINER.shap_values(X)
    # SHAP >= 0.40 with TreeExplainer returns a list [neg_class, pos_class] for
    # binary classifiers. Always extract the positive-class (index 1) values.
    if isinstance(shap_values, list):
        sv_raw = np.array(shap_values[1])
    else:
        sv_raw = np.array(shap_values)
    # sv_raw may be (1, n_features) or (n_features,) — always flatten to 1-D
    sv_arr = sv_raw.flatten()
    feature_names = ml.FEATURE_NAMES

    top_idx = np.argsort(np.abs(sv_arr))[::-1][:10]
    X_dense = X.toarray().flatten()
    shap_top10 = [
        ShapEntry(
            feature=feature_names[i] if i < len(feature_names) else f"f{i}",
            shap_value=round(float(sv_arr[i]), 6),
            raw_value=round(float(X_dense[i]), 6),
        )
        for i in top_idx
    ]

    # ── recall at requested threshold ─────────────────────────────────────────
    curve_entry   = ml.recall_at_threshold(patient.threshold)
    recall_val    = curve_entry.get("recall", 0.0)
    precision_val = curve_entry.get("precision", 0.0)

    # ── audit log ─────────────────────────────────────────────────────────────
    audit_id = log_prediction(
        patient_dict=patient.model_dump(exclude={"threshold", "session_id"}),
        probability=probability,
        threshold=patient.threshold,
        prediction=prediction,
        session_id=patient.session_id,
    )

    return PredictResponse(
        probability=round(probability, 4),
        prediction=prediction,
        risk_label=risk_label,
        threshold=patient.threshold,
        recall_at_threshold=recall_val,
        precision_at_threshold=precision_val,
        shap_top10=shap_top10,
        icd9_labels=icd9_labels,
        audit_id=audit_id,
    )
