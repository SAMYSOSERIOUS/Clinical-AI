"""
POST /upload/csv

Accepts a CSV file upload, validates required columns, batch-predicts all rows,
returns a list of PredictResponse-like dicts and logs each to SQLite.

Required columns: diag_1, diag_2, diag_3, num_medications, total_visits,
                  time_in_hospital, num_lab_procedures
Optional columns: encounter_id, threshold, session_id
"""

from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from scipy.sparse import csr_matrix, hstack

from backend.core import model_loader as ml
from backend.core.audit_logger import log_prediction
from backend.core.icd9_utils import icd9_lookup

router = APIRouter()

REQUIRED_COLS = {
    "diag_1", "diag_2", "diag_3",
    "num_medications", "total_visits",
    "time_in_hospital", "num_lab_procedures",
}
NUMERIC_COLS = ml.NUMERIC_COLS


def _predict_row(row: dict, threshold: float = 0.32, session_id: str = "") -> dict[str, Any]:
    diag_text = " ".join(
        icd9_lookup(str(row.get(c, "")))
        for c in ("diag_1", "diag_2", "diag_3")
        if str(row.get(c, "")) not in ("nan", "", "None")
    )
    text_v = ml.TFIDF.transform([diag_text])
    num_df = pd.DataFrame(
        [[row.get("total_visits", 0), row.get("num_medications", 0),
          row.get("time_in_hospital", 1), row.get("num_lab_procedures", 0)]],
        columns=NUMERIC_COLS,
    )
    num_v = csr_matrix(ml.SCALER.transform(num_df))
    X = hstack([text_v, num_v])

    probability = float(ml.MODEL.predict_proba(X)[0, 1])
    prediction  = int(probability > threshold)
    if probability >= threshold:
        risk_label = "HIGH" if probability >= threshold + 0.10 else "MEDIUM"
    else:
        risk_label = "MEDIUM" if probability >= threshold * 0.75 else "LOW"

    audit_id = log_prediction(
        patient_dict={k: row.get(k) for k in REQUIRED_COLS},
        probability=probability,
        threshold=threshold,
        prediction=prediction,
        session_id=session_id,
    )

    curve_entry   = ml.recall_at_threshold(threshold)
    icd9_labels   = {row.get("diag_1", ""): icd9_lookup(str(row.get("diag_1", "")))}

    return {
        "encounter_id": row.get("encounter_id", ""),
        "probability":  round(probability, 4),
        "prediction":   prediction,
        "risk_label":   risk_label,
        "threshold":    threshold,
        "recall_at_threshold": curve_entry.get("recall", 0.0),
        "icd9_primary_label":  icd9_labels.get(row.get("diag_1", ""), ""),
        "audit_id": audit_id,
    }


@router.post("/upload/csv")
async def upload_csv(
    file: UploadFile = File(...),
    threshold: float = Query(0.32, ge=0.01, le=0.99),
    session_id: str  = Query(""),
) -> dict:
    if ml.MODEL is None:
        raise HTTPException(503, "Model not loaded — run train_model.py first.")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(400, f"Cannot parse CSV: {exc}") from exc

    # Validate columns
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        raise HTTPException(
            422,
            f"Missing required columns: {sorted(missing)}. "
            f"Required: {sorted(REQUIRED_COLS)}",
        )

    # Cap at 500 rows to prevent abuse
    if len(df) > 500:
        raise HTTPException(413, "CSV exceeds 500-row limit per upload.")

    # Use per-row threshold if present, else use query param
    results = []
    for _, row in df.iterrows():
        t = float(row.get("threshold", threshold))
        sid = str(row.get("session_id", session_id))
        results.append(_predict_row(row.to_dict(), threshold=t, session_id=sid))

    return {"count": len(results), "results": results}
