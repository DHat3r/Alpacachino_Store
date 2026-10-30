"""Pruebas de la configuración: DATABASE_URL y /api/config."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, settings


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


def test_config_publica(client: TestClient):
    data = client.get("/api/config").json()
    assert data["shipping_cost"] == settings.SHIPPING_COST
    assert data["free_shipping_from"] == settings.FREE_SHIPPING_FROM
    assert data["reservation_minutes"] == settings.reservation_minutes
    assert data["seller"]["name"]
    assert data["payment_provider"] in {"mercadopago", "webpay", "manual"}


def test_config_publica_reserva_depende_del_medio_de_pago(
    client: TestClient, monkeypatch
):
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "mercadopago")
    assert (
        client.get("/api/config").json()["reservation_minutes"]
        == settings.STOCK_RESERVATION_MINUTES
    )

    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "manual")
    monkeypatch.setattr(settings, "MANUAL_PAYMENT_HOURS", 24)
    data = client.get("/api/config").json()
    assert data["reservation_minutes"] == 24 * 60
    assert data["payment_instructions"]["deadline_hours"] == 24
