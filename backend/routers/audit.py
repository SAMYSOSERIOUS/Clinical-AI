"""
GET /audit/fairness  — Fairlearn MetricFrame across Race, Gender, Age
GET /audit/log       — Paginated SQLite audit log
GET /recall-curve    — Pre-computed threshold sweep from recall_curve.json
"""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fairlearn.metrics import MetricFrame, false_negative_rate, false_positive_rate, selection_rate

from backend.core import model_loader as ml
from backend.core.audit_logger import get_log_page

router = APIRouter()


def _build_metric_frame(sensitive_col: str) -> dict:
    if not ml.TEST_DATA:
        raise HTTPException(503, "Test data not loaded — run train_model.py first.")

    sens  = pd.DataFrame(ml.TEST_DATA["sens_test"])
    y_true = pd.Series(ml.TEST_DATA["y_test"])
    y_pred = pd.Series(ml.TEST_DATA["preds"])

    mf = MetricFrame(
        metrics={
            "FNR":            false_negative_rate,
            "FPR":            false_positive_rate,
            "selection_rate": selection_rate,
        },
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sens[sensitive_col],
    )

    by_group = mf.by_group.reset_index()
    by_group.columns = [sensitive_col.capitalize(), "FNR", "FPR", "selection_rate"]
    by_group = by_group.sort_values("FNR", ascending=False)

    disparity = mf.difference()
    overall   = mf.overall

    return {
        "sensitive_feature": sensitive_col,
        "overall": {
            "FNR":            round(float(overall["FNR"]), 4),
            "FPR":            round(float(overall["FPR"]), 4),
            "selection_rate": round(float(overall["selection_rate"]), 4),
        },
        "disparity": {
            "FNR":            round(float(disparity["FNR"]), 4),
            "FPR":            round(float(disparity["FPR"]), 4),
            "selection_rate": round(float(disparity["selection_rate"]), 4),
        },
        "risk_level": _risk_level(float(disparity["FNR"])),
        "by_group": by_group.to_dict(orient="records"),
    }


def _risk_level(gap: float) -> str:
    if gap > 0.15:
        return "HIGH"
    if gap > 0.07:
        return "MEDIUM"
    return "LOW"


@router.get("/audit/fairness")
def fairness_audit(group: str = Query("race", pattern="^(race|gender|age)$")) -> dict:
    """Return Fairlearn MetricFrame results for a single sensitive attribute."""
    return _build_metric_frame(group)


@router.get("/audit/fairness/all")
def fairness_audit_all() -> dict:
    """Return MetricFrame results for Race, Gender, and Age together."""
    return {
        "race":   _build_metric_frame("race"),
        "gender": _build_metric_frame("gender"),
        "age":    _build_metric_frame("age"),
    }


@router.get("/audit/log")
def audit_log(
    page: int      = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """Return a paginated slice of the SQLite audit log, newest first."""
    return get_log_page(page=page, page_size=page_size)


@router.get("/recall-curve")
def recall_curve() -> list[dict]:
    """Return the pre-computed threshold sweep array."""
    if not ml.RECALL_CURVE:
        raise HTTPException(503, "Recall curve not loaded — run train_model.py first.")
    return ml.RECALL_CURVE
