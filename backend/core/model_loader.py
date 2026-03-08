"""
model_loader.py
===============
Loads all trained artefacts into module-level singletons at FastAPI startup.
Import the singletons directly:

    from backend.core.model_loader import MODEL, TFIDF, SCALER, EXPLAINER, RECALL_CURVE
"""

import json
from pathlib import Path
from typing import Any

import joblib
from xgboost import XGBClassifier

MODELS_DIR = Path(__file__).resolve().parents[2] / "backend" / "models"

NUMERIC_COLS = ["total_visits", "num_medications", "time_in_hospital", "num_lab_procedures"]

# Module-level singletons — populated by load_all()
MODEL: Any = None
TFIDF: Any = None
SCALER: Any = None
EXPLAINER: Any = None
RECALL_CURVE: list[dict] = []
TEST_DATA: dict = {}
FEATURE_NAMES: list[str] = []


def load_all() -> None:
    """Called once at FastAPI startup. Populates all singletons."""
    global MODEL, TFIDF, SCALER, EXPLAINER, RECALL_CURVE, TEST_DATA, FEATURE_NAMES

    # Support both native XGBoost format (.ubj) and legacy pickle (.pkl)
    _model_path = (
        MODELS_DIR / "model.ubj" if (MODELS_DIR / "model.ubj").exists()
        else MODELS_DIR / "model.pkl"
    )
    _check(_model_path)
    _check(MODELS_DIR / "tfidf.pkl")
    _check(MODELS_DIR / "scaler.pkl")
    _check(MODELS_DIR / "shap_explainer.pkl")
    _check(MODELS_DIR / "recall_curve.json")

    if _model_path.suffix == ".ubj":
        MODEL = XGBClassifier()
        MODEL.load_model(_model_path)
    else:
        MODEL = joblib.load(_model_path)
    TFIDF     = joblib.load(MODELS_DIR / "tfidf.pkl")
    SCALER    = joblib.load(MODELS_DIR / "scaler.pkl")
    EXPLAINER = joblib.load(MODELS_DIR / "shap_explainer.pkl")

    RECALL_CURVE = json.loads((MODELS_DIR / "recall_curve.json").read_text())

    test_data_path = MODELS_DIR / "test_data.pkl"
    if test_data_path.exists():
        TEST_DATA = joblib.load(test_data_path)

    FEATURE_NAMES = TFIDF.get_feature_names_out().tolist() + NUMERIC_COLS


def _check(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(
            f"Model artefact not found: {path}\n"
            "Run:  python -m backend.scripts.train_model --skip-enrichment"
        )


def recall_at_threshold(threshold: float) -> dict:
    """Return the recall/precision/accuracy entry nearest to *threshold*."""
    if not RECALL_CURVE:
        return {}
    return min(RECALL_CURVE, key=lambda r: abs(r["threshold"] - threshold))
