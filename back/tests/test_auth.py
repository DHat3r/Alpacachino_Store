"""Pruebas de autenticación, tokens y control de roles (RF-08, RNF-02)."""

from fastapi.testclient import TestClient


def test_registro_exitoso(client: TestClient):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "nuevo@test.cl",
            "username": "nuevo",
            "password": "Clave1234",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == "nuevo@test.cl"
    assert body["role"] == "customer"
    assert "password" not in body and "hashed_password" not in body


def test_registro_email_duplicado(client: TestClient, customer):
    res = client.post(
        "/api/auth/register",
        json={
            "email": customer.email,
            "username": "otro",
            "password": "Clave1234",
        },
    )
    assert res.status_code == 409


def test_registro_password_debil(client: TestClient):
    res = client.post(
        "/api/auth/register",
        json={"email": "debil@test.cl", "username": "debil", "password": "sololetras"},
    )
    assert res.status_code == 422


def test_login_y_me(client: TestClient, customer):
    res = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    )
    assert res.status_code == 200
    tokens = res.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["access_token"] and tokens["refresh_token"]

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == customer.username


def test_login_password_incorrecta(client: TestClient, customer):
    res = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Incorrecta123"},
    )
    assert res.status_code == 401


def test_me_sin_token(client: TestClient):
    assert client.get("/api/auth/me").status_code == 401


def test_refresh_token(client: TestClient, customer):
    login = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    ).json()
    res = client.post(
        "/api/auth/refresh",
        params={"token": login["refresh_token"]},
    )
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_refresh_con_access_token_falla(client: TestClient, customer):
    login = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    ).json()
    res = client.post("/api/auth/refresh", params={"token": login["access_token"]})
    assert res.status_code == 401


def test_cliente_no_puede_acceder_a_admin(client: TestClient, auth_headers):
    res = client.get("/api/admin/dashboard", headers=auth_headers)
    assert res.status_code == 403


def test_admin_puede_acceder_a_dashboard(client: TestClient, admin_headers):
    res = client.get("/api/admin/dashboard", headers=admin_headers)
    assert res.status_code == 200
    assert "total_products" in res.json()
