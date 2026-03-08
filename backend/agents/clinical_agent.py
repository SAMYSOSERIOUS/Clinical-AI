"""
LangGraph clinical agent with 5 tools + per-session multi-turn memory.
"""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from backend.core.icd9_utils import icd9_lookup as _icd9_lookup_plain
from backend.core import model_loader as ml

load_dotenv()

# ── per-session memory: session_id → list[BaseMessage] ───────────────────────
_session_memory: dict[str, list[BaseMessage]] = {}

SYSTEM_PROMPT = """You are a clinical AI assistant embedded in a diabetes readmission dashboard.
You help clinicians understand patient risk, SHAP explanations, and fairness metrics.
Use tools to answer specific questions. Be concise and evidence-based. 
Never give a definitive clinical diagnosis — always recommend clinician review."""


# ── Tool 1: ICD-9 Lookup ──────────────────────────────────────────────────────
@tool
def icd9_lookup(code: str) -> str:
    """
    Look up the official clinical English description for an ICD-9 diagnosis code.
    Input:  ICD-9 code string e.g. '428.0' or '250.01'
    Output: Clinical description string
    """
    return _icd9_lookup_plain(code)


# ── Tool 2: Explain SHAP ──────────────────────────────────────────────────────
@tool
def explain_shap(shap_json: str) -> str:
    """
    Convert a JSON list of SHAP entries into natural-language clinical bullet points.
    Input:  JSON string — list of {feature, shap_value, raw_value}
    Output: Bullet-point explanation of the top risk drivers.
    """
    import json

    try:
        entries = json.loads(shap_json)
    except Exception:
        return "Could not parse SHAP JSON."

    lines = ["**Top risk drivers for this patient:**\n"]
    for e in entries[:10]:
        feat  = e.get("feature", "unknown")
        sv    = float(e.get("shap_value", 0))
        rv    = float(e.get("raw_value", 0))
        direction = "↑ increases" if sv > 0 else "↓ decreases"
        lines.append(f"- **{feat}** (value={rv:.2f}): {direction} readmission risk (SHAP={sv:+.3f})")

    return "\n".join(lines)


# ── Tool 3: Suggest Interventions ─────────────────────────────────────────────
@tool
def suggest_interventions(risk_probability: float, diagnoses: str) -> str:
    """
    Given a readmission risk probability and comma-separated diagnosis descriptions,
    suggest 3–5 specific clinical interventions to reduce readmission risk.
    Input:  risk_probability (float 0–1), diagnoses (comma-separated descriptions)
    Output: Numbered list of clinical interventions.
    """
    level = "HIGH" if risk_probability >= 0.5 else ("MEDIUM" if risk_probability >= 0.3 else "LOW")
    return (
        f"Risk level: **{level}** (p={risk_probability:.2f})\n"
        f"Diagnoses: {diagnoses}\n\n"
        "Please use the language model to generate context-aware interventions based on these inputs."
    )


# ── Tool 4: Query Fairness Audit ──────────────────────────────────────────────
@tool
def query_fairness_audit(group: str, metric: str = "FNR") -> str:
    """
    Retrieve a live Fairlearn MetricFrame result for a demographic group.
    group:  one of 'race', 'gender', 'age'
    metric: 'FNR', 'FPR', or 'selection_rate' (default FNR)
    Output: Per-group metric table as text.
    """
    if not ml.TEST_DATA:
        return "Test data not loaded. Run train_model.py first."

    import pandas as pd
    from fairlearn.metrics import MetricFrame, false_negative_rate, false_positive_rate, selection_rate

    group = group.lower().strip()
    if group not in ("race", "gender", "age"):
        return "group must be one of: race, gender, age"

    metric_map = {
        "fnr": false_negative_rate,
        "fpr": false_positive_rate,
        "selection_rate": selection_rate,
    }
    metric_key = metric.lower().replace(" ", "_")
    metric_fn  = metric_map.get(metric_key, false_negative_rate)

    sens = pd.DataFrame(ml.TEST_DATA["sens_test"])
    y_true = pd.Series(ml.TEST_DATA["y_test"])
    y_pred = pd.Series(ml.TEST_DATA["preds"])

    mf = MetricFrame(
        metrics={"value": metric_fn},
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sens[group],
    )
    result = mf.by_group.reset_index()
    result.columns = [group, metric.upper()]
    result = result.sort_values(metric.upper(), ascending=False)
    disparity = mf.difference()["value"]
    overall   = mf.overall["value"]

    lines = [f"**{metric.upper()} by {group.capitalize()}:**\n"]
    lines += [f"- {row[group]}: {row[metric.upper()]:.3f}" for _, row in result.iterrows()]
    lines.append(f"\nOverall: {overall:.3f}  |  Disparity gap: {disparity:.4f}")
    return "\n".join(lines)


# ── Tool 5: Get Recall at Threshold ──────────────────────────────────────────
@tool
def get_recall_at_threshold(threshold: float) -> str:
    """
    Return the model's recall, precision, and accuracy at a given decision threshold.
    Input:  threshold (float between 0.10 and 0.70)
    Output: Human-readable string with metrics at that threshold.
    """
    entry = ml.recall_at_threshold(threshold)
    if not entry:
        return "Recall curve not loaded. Run train_model.py first."
    return (
        f"At threshold **{entry['threshold']:.2f}**:\n"
        f"- Recall (sensitivity): {entry['recall']:.2%}\n"
        f"- Precision: {entry['precision']:.2%}\n"
        f"- Accuracy: {entry['accuracy']:.2%}"
    )


# ── Agent factory ─────────────────────────────────────────────────────────────

TOOLS = [icd9_lookup, explain_shap, suggest_interventions, query_fairness_audit, get_recall_at_threshold]


def _build_llm() -> ChatOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in environment.")
    return ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)


def run_agent(
    session_id: str,
    user_message: str,
    patient_context: dict | None = None,
) -> Any:
    """
    Invoke the ReAct agent with full multi-turn history.
    Returns the LangGraph result dict (messages list).
    Appends the new exchange to session memory.
    """
    llm = _build_llm()
    agent = create_react_agent(llm, TOOLS)

    history = _session_memory.setdefault(session_id, [])

    # Optionally prepend patient context on the first message of a session
    if patient_context and not history:
        context_str = (
            "Patient context loaded:\n"
            + "\n".join(f"  {k}: {v}" for k, v in patient_context.items())
        )
        history.append(HumanMessage(content=context_str))
        history.append(AIMessage(content="Patient context received. How can I help?"))

    history.append(HumanMessage(content=user_message))

    result = agent.invoke({"messages": history})

    # Store only human + AI messages (skip tool call internals for brevity)
    final_messages = result["messages"]
    _session_memory[session_id] = final_messages

    return result


def get_session_history(session_id: str) -> list[dict]:
    """Return simplified history for the session."""
    history = _session_memory.get(session_id, [])
    out = []
    for msg in history:
        if isinstance(msg, HumanMessage):
            out.append({"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage) and msg.content:
            out.append({"role": "assistant", "content": msg.content})
    return out


def clear_session(session_id: str) -> None:
    _session_memory.pop(session_id, None)
