"""Health check and utility routes."""

from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    """Full health check: API + Database."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "version": "0.1.0",
    }


@router.get("/ready")
def readiness():
    """Kubernetes readiness probe."""
    return {"ready": True}