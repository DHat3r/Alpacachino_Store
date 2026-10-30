"""Pruebas de salud, cabeceras de seguridad y documentación."""

from fastapi.testclient import TestClient


def test_health_ok(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_root_ok(client: TestClient):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["app"]


def test_health_incluye_estado_del_latido(client: TestClient):
    body = client.get("/api/health").json()
    ka = body["keepalive"]
    # En pruebas está desactivado para no consultar la base de desarrollo.
    assert ka["enabled"] is False
    assert ka["interval_seconds"] == 0
    assert ka["stock"]["inconsistent"] == 0


def test_security_headers(client: TestClient):
    res = client.get("/api/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"


def test_openapi_disponible_en_dev(client: TestClient):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/api/products" in paths
    assert "/api/products/{sku_or_id}" in paths
    assert "/api/config" in paths
    # Rama avance-edt-2026-10-30: lo agendado desde noviembre no está expuesto.
    assert "/api/auth/login" not in paths
    assert "/api/orders/checkout" not in paths
    assert "/api/forum/posts" not in paths
