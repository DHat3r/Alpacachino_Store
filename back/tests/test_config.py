"""Pruebas de la configuración (validación de DATABASE_URL)."""

import pytest

from app.core.config import Settings


def _settings(**overrides) -> Settings:
    base = {"SECRET_KEY": "x" * 32, "DATABASE_URL": ""}
    base.update(overrides)
    return Settings(**base)


def test_database_url_acepta_y_normaliza_esquema_postgres():
    s = _settings(DATABASE_URL="postgres://u:p@h:5432/db")

    assert s.database_url == "postgresql+psycopg://u:p@h:5432/db"


def test_database_url_rechaza_la_url_https_de_supabase():
    s = _settings(DATABASE_URL="https://abc.supabase.co")

    with pytest.raises(ValueError, match="SUPABASE_URL"):
        _ = s.database_url


def test_database_url_por_defecto_es_el_postgres_local():
    s = _settings()

    assert s.database_url.startswith("postgresql+psycopg://alpaca:")
    assert s.database_url.endswith("/alpacachino")
