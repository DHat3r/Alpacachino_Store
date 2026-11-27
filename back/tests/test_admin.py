"""Pruebas del panel administrativo (RF-09)."""

from fastapi.testclient import TestClient


def test_dashboard_kpis(client: TestClient, admin_headers, product_factory):
    product_factory(stock=2)  # stock bajo
    res = client.get("/api/admin/dashboard", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total_products"] == 1
    assert body["low_stock_alerts"] == 1
    assert body["total_orders"] == 0


def test_stock_bajo(client: TestClient, admin_headers, product_factory):
    product_factory(sku="BAJO", stock=1)
    product_factory(sku="ALTO", stock=50)

    res = client.get(
        "/api/admin/inventory/low-stock", params={"threshold": 5}, headers=admin_headers
    )
    assert res.status_code == 200
    assert [i["sku"] for i in res.json()] == ["BAJO"]


def test_ajuste_inventario_y_movimientos(
    client: TestClient, admin_headers, product_factory
):
    product = product_factory(stock=5)

    res = client.patch(
        f"/api/admin/inventory/{product.id}",
        params={"delta": 10, "reason": "restock", "reference": "oc-99"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["new_quantity"] == 15

    movs = client.get(
        f"/api/admin/inventory/movements/{product.id}", headers=admin_headers
    )
    assert movs.status_code == 200
    assert movs.json()["total"] == 1
    assert movs.json()["items"][0]["delta"] == 10
    assert movs.json()["items"][0]["reason"] == "restock"


def test_ajuste_inventario_motivo_invalido(
    client: TestClient, admin_headers, product_factory
):
    product = product_factory(stock=5)

    res = client.patch(
        f"/api/admin/inventory/{product.id}",
        params={"delta": 1, "reason": "regalo"},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_listar_usuarios(client: TestClient, admin_headers, customer):
    res = client.get("/api/admin/users", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["total"] == 2  # admin + customer
    emails = {u["email"] for u in res.json()["items"]}
    assert customer.email in emails


def test_cambiar_rol(client: TestClient, admin_headers, customer):
    res = client.patch(
        f"/api/admin/users/{customer.id}/role",
        params={"new_role": "moderator"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["role"] == "moderator"


def test_no_degradar_admin(client: TestClient, admin_headers, admin_user):
    res = client.patch(
        f"/api/admin/users/{admin_user.id}/role",
        params={"new_role": "customer"},
        headers=admin_headers,
    )
    assert res.status_code == 400


def test_activar_desactivar_usuario(client: TestClient, admin_headers, customer):
    res = client.patch(
        f"/api/admin/users/{customer.id}/toggle-active", headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    res = client.patch(
        f"/api/admin/users/{customer.id}/toggle-active", headers=admin_headers
    )
    assert res.json()["is_active"] is True


def test_usuario_inactivo_no_puede_login(
    client: TestClient, admin_headers, customer
):
    client.patch(f"/api/admin/users/{customer.id}/toggle-active", headers=admin_headers)
    res = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    )
    assert res.status_code == 403
    assert "desactivada" in res.json()["detail"].lower()


def test_admin_endpoints_protegidos(client: TestClient, auth_headers):
    assert client.get("/api/admin/users", headers=auth_headers).status_code == 403
    assert (
        client.get("/api/admin/inventory/low-stock", headers=auth_headers).status_code
        == 403
    )


def test_inventario_lista_todos_los_productos(
    client: TestClient, admin_headers, product_factory
):
    product_factory(sku="MUCHO", title="Akira 1", stock=50)
    product_factory(sku="POCO", title="Berserk 1", stock=2, reserved=1)
    product_factory(sku="APAGADO", title="Claymore 1", stock=7, is_active=False)

    res = client.get("/api/admin/inventory", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    # Por defecto ordena por disponible ascendente.
    assert [i["sku"] for i in body["items"]] == ["POCO", "MUCHO"]
    poco = body["items"][0]
    assert (poco["available"], poco["reserved"], poco["total"]) == (2, 1, 3)


def test_inventario_filtros_orden_y_todos(
    client: TestClient, admin_headers, product_factory
):
    for n in range(25):
        product_factory(sku=f"INV-{n:02d}", title=f"Tomo {n:02d}", stock=n)
    product_factory(sku="APAGADO", title="Inactivo", stock=1, is_active=False)

    pagina = client.get(
        "/api/admin/inventory", params={"size": 20, "page": 2}, headers=admin_headers
    ).json()
    assert pagina["total"] == 25 and len(pagina["items"]) == 5

    todos = client.get(
        "/api/admin/inventory",
        params={"size": 0, "include_inactive": True, "sort": "sku", "order": "desc"},
        headers=admin_headers,
    ).json()
    assert todos["total"] == 26 and len(todos["items"]) == 26
    assert todos["items"][0]["sku"] == "INV-24"

    bajos = client.get(
        "/api/admin/inventory", params={"threshold": 3, "size": 0}, headers=admin_headers
    ).json()
    assert {i["sku"] for i in bajos["items"]} == {"INV-00", "INV-01", "INV-02", "INV-03"}

    buscado = client.get(
        "/api/admin/inventory", params={"q": "inv-1"}, headers=admin_headers
    ).json()
    assert buscado["total"] == 10


def test_inventario_requiere_admin(client: TestClient, auth_headers):
    res = client.get("/api/admin/inventory", headers=auth_headers)
    assert res.status_code == 403
