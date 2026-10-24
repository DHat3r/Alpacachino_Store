"""Punto de entrada de la API AlpacachinoStore."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="0.1.0",
    description="API del PMV de AlpacachinoStore (e-commerce + foro comunitario).",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["root"])
def root() -> dict:
    return {"app": settings.APP_NAME, "env": settings.ENV, "docs": "/docs"}


@app.get("/api/health", tags=["health"])
def health() -> dict:
    """Verifica que la API y PostgreSQL respondan."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "env": settings.ENV}
