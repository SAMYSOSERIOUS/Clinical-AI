"""
train_model.py
==============
Trains the XGBoost readmission model from the UCI 10-year diabetes dataset.
Saves artefacts to  backend/models/:
  model.pkl          — trained XGBClassifier
  tfidf.pkl          — fitted TfidfVectorizer (raw ICD-9 codes)
  scaler.pkl         — fitted StandardScaler
  shap_explainer.pkl — shap.TreeExplainer
  recall_curve.json  — threshold sweep [{threshold, recall, precision, accuracy}]
  test_data.pkl      — dict with X_test, y_test, sens_test for fairness audit

Usage:
  python -m backend.scripts.train_model            # full pipeline (slow, ~15 min)
  python -m backend.scripts.train_model --skip-enrichment  # fast (raw codes only)
"""

import argparse
import json
import os
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
import kagglehub
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
from dotenv import load_dotenv

# ── paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "backend" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env", override=False)
warnings.filterwarnings("ignore")

NUMERIC_COLS = ["total_visits", "num_medications", "time_in_hospital", "num_lab_procedures"]
SENSITIVE_COLS = ["race", "gender", "age"]
THRESHOLD = 0.32


# ── ICD-9 lookup (inline to avoid circular import at script runtime) ──────────
sys.path.insert(0, str(ROOT))
from backend.core.icd9_utils import icd9_lookup  # noqa: E402


def enrich_row(row: pd.Series) -> str:
    codes = [str(row.get("diag_1", "")), str(row.get("diag_2", "")), str(row.get("diag_3", ""))]
    return " ".join(icd9_lookup(c) for c in codes if c not in ("nan", "", "None"))


# ── main ───────────────────────────────────────────────────────────────────────
def main(skip_enrichment: bool = False) -> None:
    print("▶ Downloading dataset via kagglehub …")
    path = kagglehub.dataset_download("jimschacko/10-years-diabetes-dataset")
    df_raw = pd.read_csv(os.path.join(path, "diabetes.csv"))
    print(f"  Shape: {df_raw.shape[0]:,} rows × {df_raw.shape[1]} columns")

    df = df_raw.copy()
    df.replace("?", np.nan, inplace=True)

    # Drop leakage / high-missingness columns
    drop_cols = ["weight", "payer_code", "medical_specialty"]
    id_cols = [c for c in ["id", "encounter_id", "patient_nbr"] if c in df.columns]
    df.drop(columns=drop_cols + id_cols, errors="ignore", inplace=True)
    df.dropna(subset=["diag_1", "diag_2", "diag_3"], inplace=True)

    df["target"] = (df["readmitted"] == "<30").astype(int)
    df["total_visits"] = (
        df["number_outpatient"] + df["number_emergency"] + df["number_inpatient"]
    )

    # ── text feature ──────────────────────────────────────────────────────────
    if not skip_enrichment:
        print("▶ Enriching ICD-9 codes (this takes ~15 min) …")
        df["diag_text"] = df.apply(enrich_row, axis=1)
    else:
        print("▶ --skip-enrichment: using raw ICD-9 codes …")
        df["diag_text"] = (
            df["diag_1"].astype(str) + " " +
            df["diag_2"].astype(str) + " " +
            df["diag_3"].astype(str)
        )

    # ── train / test split ────────────────────────────────────────────────────
    y = df["target"]
    (
        X_text_train, X_text_test,
        X_num_train,  X_num_test,
        X_sens_train, X_sens_test,
        y_train,      y_test,
    ) = train_test_split(
        df["diag_text"],
        df[NUMERIC_COLS],
        df[SENSITIVE_COLS],
        y,
        test_size=0.2,
        stratify=y,
        random_state=42,
    )

    # ── fit transformers ─────────────────────────────────────────────────────
    negations = {"no", "not", "nor", "none", "without", "never", "denies"}
    custom_stops = list(ENGLISH_STOP_WORDS - negations)

    tfidf = TfidfVectorizer(max_features=2000, sublinear_tf=True, stop_words=custom_stops)
    scaler = StandardScaler()

    X_text_train_v = tfidf.fit_transform(X_text_train)
    X_text_test_v  = tfidf.transform(X_text_test)
    X_num_train_v  = csr_matrix(scaler.fit_transform(X_num_train))
    X_num_test_v   = csr_matrix(scaler.transform(X_num_test))

    X_train = hstack([X_text_train_v, X_num_train_v])
    X_test  = hstack([X_text_test_v,  X_num_test_v])
    print(f"  Train: {X_train.shape} | Test: {X_test.shape}")

    # ── train XGBoost ─────────────────────────────────────────────────────────
    print("▶ Training XGBClassifier …")
    model = XGBClassifier(
        n_estimators=800,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=10,
        eval_metric="logloss",
        tree_method="hist",
        random_state=42,
    )
    model.fit(X_train, y_train)

    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs > THRESHOLD).astype(int)
    print(f"  Threshold      : {THRESHOLD}")
    print(f"  Clinical Recall: {recall_score(y_test, preds):.2%}")
    print(f"  Accuracy        : {accuracy_score(y_test, preds):.2%}")
    print(classification_report(y_test, preds, target_names=["Not Readmitted", "Readmitted <30d"]))

    # ── SHAP explainer ────────────────────────────────────────────────────────
    print("▶ Building SHAP TreeExplainer (sampling 500 rows) …")
    np.random.seed(42)
    sample_idx = np.random.choice(X_test.shape[0], size=min(500, X_test.shape[0]), replace=False)
    X_sample = X_test[sample_idx]
    explainer = shap.TreeExplainer(model)
    # Smoke-test SHAP
    _ = explainer.shap_values(X_sample[:5])
    print("  SHAP explainer OK.")

    # ── recall curve ─────────────────────────────────────────────────────────
    print("▶ Computing threshold sweep …")
    thresholds = np.arange(0.10, 0.71, 0.02)
    recall_curve = []
    for t in thresholds:
        p = (probs > t).astype(int)
        recall_curve.append({
            "threshold": round(float(t), 2),
            "recall":    round(recall_score(y_test, p), 4),
            "precision": round(precision_score(y_test, p, zero_division=0), 4),
            "accuracy":  round(accuracy_score(y_test, p), 4),
        })

    # ── save artefacts ────────────────────────────────────────────────────────
    print(f"▶ Saving artefacts to {MODELS_DIR} …")
    model.save_model(MODELS_DIR / "model.ubj")   # native XGBoost format — no pickle warnings
    joblib.dump(tfidf,     MODELS_DIR / "tfidf.pkl")
    joblib.dump(scaler,    MODELS_DIR / "scaler.pkl")
    joblib.dump(explainer, MODELS_DIR / "shap_explainer.pkl")

    (MODELS_DIR / "recall_curve.json").write_text(json.dumps(recall_curve, indent=2))

    # Save test data for fairness audit (reset indices for clean alignment)
    feature_names = tfidf.get_feature_names_out().tolist() + NUMERIC_COLS
    test_data = {
        "X_test_text": X_text_test.reset_index(drop=True).tolist(),
        "X_test_num":  X_num_test.reset_index(drop=True).to_dict(orient="list"),
        "y_test":      y_test.reset_index(drop=True).tolist(),
        "probs":       probs.tolist(),
        "preds":       preds.tolist(),
        "sens_test":   X_sens_test.fillna("Unknown").reset_index(drop=True).to_dict(orient="list"),
        "feature_names": feature_names,
    }
    joblib.dump(test_data, MODELS_DIR / "test_data.pkl")

    print("✅ Done.")
    print(f"   model.ubj          {(MODELS_DIR / 'model.ubj').stat().st_size // 1024} KB")
    print(f"   tfidf.pkl          {(MODELS_DIR / 'tfidf.pkl').stat().st_size // 1024} KB")
    print(f"   scaler.pkl         {(MODELS_DIR / 'scaler.pkl').stat().st_size // 1024} KB")
    print(f"   shap_explainer.pkl {(MODELS_DIR / 'shap_explainer.pkl').stat().st_size // 1024} KB")
    print(f"   recall_curve.json  {len(recall_curve)} rows")
    print(f"   test_data.pkl      {(MODELS_DIR / 'test_data.pkl').stat().st_size // 1024} KB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the diabetic-readmission model.")
    parser.add_argument(
        "--skip-enrichment",
        action="store_true",
        help="Use raw ICD-9 codes instead of enriched text (fast).",
    )
    args = parser.parse_args()
    main(skip_enrichment=args.skip_enrichment)
