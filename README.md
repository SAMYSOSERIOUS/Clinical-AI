# Clinical AI — Diabetes Readmission Risk

Full-stack application for predicting 30-day hospital readmission in diabetic patients using XGBoost, SHAP explanations, Fairlearn audits, and a LangGraph AI agent.

---

## Architecture

```
backend/          FastAPI + XGBoost + LangGraph
  core/           model_loader, audit_logger, icd9_utils
  routers/        predict, upload, audit, chat
  agents/         clinical_agent (LangGraph ReAct, 5 tools)
  scripts/        train_model.py
  models/         saved artefacts (created by training)

frontend/         Vite 5 + React 18 + TypeScript + Tailwind v3
  src/pages/      Dashboard, Predict, Chat, FairnessAudit, AuditLog

data/             SQLite audit.db (auto-created at startup)
Notebooks/        Source Jupyter notebooks
```

---

## Quick Start

### 1 — Environment

Create and activate a Python virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
```

Install Python dependencies:

```bash
pip install -r backend/requirements.txt
```

Create a `.env` file in the project root:

```
OPENAI_API_KEY=sk-...
```

### 2 — Train the model

```bash
python -m backend.scripts.train_model --skip-enrichment
```

- `--skip-enrichment` uses raw ICD-9 codes (fast, ~2 min)
- Without the flag, the pipeline enriches text via ICD-9 lookup (~15 min)

Artefacts saved to `backend/models/`:
`model.pkl`, `tfidf.pkl`, `scaler.pkl`, `shap_explainer.pkl`, `recall_curve.json`, `test_data.pkl`

### 3 — Start the backend

```bash
uvicorn backend.main:app --reload
```

API available at `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

### 4 — Start the frontend

```bash
cd frontend
npm install     # first time only
npm run dev
```

App available at `http://localhost:5173`

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Model stats, recall–precision curve, recent predictions |
| Predict | `/predict` | Manual form or CSV upload, SHAP chart, recall slider |
| AI Agent | `/chat` | Multi-turn LangGraph agent with tool-call indicators |
| Fairness Audit | `/fairness` | FNR by race / gender / age, disparity heatmap |
| Audit Log | `/log` | Paginated sortable prediction log, JSON export |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/predict` | Single patient prediction |
| POST | `/upload/csv` | Batch prediction (max 500 rows) |
| GET | `/audit/fairness?group=race` | Fairness report for one group |
| GET | `/audit/fairness/all` | All three groups at once |
| GET | `/audit/log` | Paginated audit log |
| GET | `/recall-curve` | Recall–precision curve data |
| POST | `/chat` | Streaming SSE chat (LangGraph agent) |
| GET | `/chat/{session_id}/history` | Chat history |
| DELETE | `/chat/{session_id}` | Clear session |
| GET | `/health` | Model load status |

---

## Model

- **Algorithm**: XGBClassifier (n_estimators=800, max_depth=5, learning_rate=0.05)
- **Features**: TF-IDF on ICD-9 codes (2000 features) + 4 numeric columns
- **Default threshold**: 0.32 (≈87% recall, optimised for clinical sensitivity)
- **SHAP**: TreeExplainer — top 10 features per prediction

## AI Agent Tools

1. `icd9_lookup` — Describe an ICD-9 diagnosis code
2. `explain_shap` — Interpret SHAP values in plain language
3. `suggest_interventions` — Clinical action recommendations by risk level
4. `query_fairness_audit` — Live FNR disparity for a demographic group
5. `get_recall_at_threshold` — Model performance at a given threshold
