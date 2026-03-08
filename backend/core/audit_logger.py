"""
SQLite audit logger — thread-safe singleton.
Table: audit_logs (id, timestamp, patient_json, probability, threshold, prediction, session_id)
"""

import sqlite3
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "audit.db"
_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the audit_logs table if it does not exist."""
    with _lock:
        conn = _get_conn()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT    NOT NULL,
                patient_json TEXT   NOT NULL,
                probability REAL    NOT NULL,
                threshold   REAL    NOT NULL,
                prediction  INTEGER NOT NULL,
                session_id  TEXT    NOT NULL DEFAULT ''
            )
            """
        )
        conn.commit()
        conn.close()


def log_prediction(
    patient_dict: dict,
    probability: float,
    threshold: float,
    prediction: int,
    session_id: str = "",
) -> int:
    """Insert one prediction record; return the new row id."""
    timestamp = datetime.now(timezone.utc).isoformat()
    patient_json = json.dumps(patient_dict)
    with _lock:
        conn = _get_conn()
        cur = conn.execute(
            """
            INSERT INTO audit_logs
                (timestamp, patient_json, probability, threshold, prediction, session_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (timestamp, patient_json, probability, threshold, prediction, session_id),
        )
        conn.commit()
        row_id = cur.lastrowid
        conn.close()
    return row_id  # type: ignore[return-value]


def get_log_page(page: int = 1, page_size: int = 20) -> dict:
    """Return a paginated slice of audit_logs, newest first."""
    offset = (page - 1) * page_size
    with _lock:
        conn = _get_conn()
        total = conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?",
            (page_size, offset),
        ).fetchall()
        conn.close()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "rows": [dict(r) for r in rows],
    }
