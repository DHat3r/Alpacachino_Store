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


def test_security_headers(client: TestClient):
    res = client.get("/api/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"


def test_openapi_disponible_en_dev(client: TestClient):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/api/auth/login" in paths
    assert "/api/products" in paths
    assert "/api/orders/checkout" in paths
    assert "/api/forum/posts" in paths
