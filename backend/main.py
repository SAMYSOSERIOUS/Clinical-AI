"""
FastAPI application entry point.

Start with:
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from backend.core import audit_logger, model_loader
from backend.routers import audit, chat, predict, upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ───────────────────────────────────────────────────────────────
    print("⏳ Initialising database …")
    audit_logger.init_db()

    print("⏳ Loading ML artefacts …")
    try:
        model_loader.load_all()
        print("✅ Models loaded.")
    except FileNotFoundError as exc:
        print(f"⚠️  {exc}")
        print("   The API will start, but /predict will return 503 until models are trained.")

    yield  # app is running

    # ── shutdown (nothing to clean up) ────────────────────────────────────────


app = FastAPI(
    title="Clinical AI — Diabetes Readmission API",
    version="1.0.0",
    description=(
        "XGBoost readmission risk prediction with SHAP explanations, "
        "Fairlearn audits, LangGraph agentic chat, and full SQLite audit logging."
    ),
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# In production set ALLOWED_ORIGINS=https://your-frontend.onrender.com
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
_env_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in _env_origins.split(",") if o.strip()] or _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── routers ───────────────────────────────────────────────────────────────────
app.include_router(predict.router,  tags=["Prediction"])
app.include_router(upload.router,   tags=["Upload"])
app.include_router(audit.router,    tags=["Audit"])
app.include_router(chat.router,     tags=["Chat"])


@app.get("/", tags=["Health"])
def root() -> dict:
    return {"status": "ok", "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health() -> dict:
    return {
        "status":       "ok",
        "model_loaded": model_loader.MODEL is not None,
        "recall_curve": len(model_loader.RECALL_CURVE),
    }
