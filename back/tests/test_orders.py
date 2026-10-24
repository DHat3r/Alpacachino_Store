"""Pruebas del flujo de compra: reserva atómica, checkout y liberación de stock (RF-04, R05)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.order import Order, OrderStatus
from app.models.product import Inventory, Product


@pytest.fixture(autouse=True)
def fake_payment(monkeypatch):
    """Evita llamar a MercadoPago/Webpay reales durante las pruebas."""
    monkeypatch.setattr(
        "app.api.routes.orders.create_payment_preference",
        lambda order: {"init_point": "https://sandbox.pago.test/123", "external_id": "ext-123"},
    )


def _checkout(client: TestClient, headers: dict, product: Product, qty: int = 1):
    return client.post(
        "/api/orders/checkout",
        headers=headers,
        json={
            "items": [{"product_id": str(product.id), "quantity": qty}],
            "shipping_address": "Av. Siempre Viva 742, Santiago",
        },
    )


def test_checkout_exitoso_reserva_stock(
    client: TestClient, auth_headers, product_factory, db: Session
):
    product = product_factory(stock=10)

    res = _checkout(client, auth_headers, product, qty=2)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["order_id"] == 1
    assert body["payment_url"].startswith("https://")

    db.expire_all()
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 8
    assert inv.reserved == 2
    assert inv.available() == 6

    order = db.get(Order, 1)
    assert order.status == OrderStatus.PENDING
    assert order.subtotal == Decimal("17980")
    assert order.total == Decimal("21480")  # + envío 3.500
    assert order.expires_at is not None


def test_checkout_envio_gratis_sobre_30k(
    client: TestClient, auth_headers, product_factory, db: Session
):
    product = product_factory(price=35000, stock=5)
    res = _checkout(client, auth_headers, product, qty=1)
    assert res.status_code == 201
    db.expire_all()
    order = db.get(Order, 1)
    assert order.shipping == Decimal("0")
    assert order.total == Decimal("35000")


def test_checkout_stock_insuficiente(
    client: TestClient, auth_headers, product_factory, db: Session
):
    product = product_factory(stock=2)
    res = _checkout(client, auth_headers, product, qty=3)
    assert res.status_code == 409
    assert "insuficiente" in res.json()["detail"].lower()

    db.expire_all()
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 2
    assert inv.reserved == 0
    assert db.query(Order).count() == 0


def test_checkout_sin_session(client: TestClient, product_factory):
    product = product_factory()
    res = client.post(
        "/api/orders/checkout",
        json={
            "items": [{"product_id": str(product.id), "quantity": 1}],
            "shipping_address": "Av. Siempre Viva 742, Santiago",
        },
    )
    assert res.status_code == 401


def test_checkout_producto_inexistente(client: TestClient, auth_headers):
    res = client.post(
        "/api/orders/checkout",
        headers=auth_headers,
        json={
            "items": [
                {
                    "product_id": "00000000-0000-0000-0000-000000000000",
                    "quantity": 1,
                }
            ],
            "shipping_address": "Av. Siempre Viva 742, Santiago",
        },
    )
    assert res.status_code == 404


def test_checkout_id_invalido(client: TestClient, auth_headers):
    res = client.post(
        "/api/orders/checkout",
        headers=auth_headers,
        json={
            "items": [{"product_id": "no-es-uuid", "quantity": 1}],
            "shipping_address": "Av. Siempre Viva 742, Santiago",
        },
    )
    assert res.status_code == 400


def test_checkout_producto_inactivo(
    client: TestClient, auth_headers, product_factory
):
    product = product_factory(is_active=False)
    assert _checkout(client, auth_headers, product).status_code == 404


def test_listar_y_ver_pedidos(
    client: TestClient, auth_headers, product_factory
):
    product = product_factory()
    _checkout(client, auth_headers, product)

    res = client.get("/api/orders", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["total"] == 1

    order_id = res.json()["items"][0]["id"]
    detail = client.get(f"/api/orders/{order_id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["items"][0]["quantity"] == 1


def test_no_puedo_ver_pedido_ajeno(
    client: TestClient, auth_headers, product_factory, user_factory, db
):
    from app.core.security import create_access_token

    product = product_factory()
    _checkout(client, auth_headers, product)

    other = user_factory(email="otro@test.cl", username="otro")
    other_headers = {
        "Authorization": f"Bearer {create_access_token(other.id, other.role.value)}"
    }
    assert client.get("/api/orders/1", headers=other_headers).status_code == 404


def test_admin_cancela_pedido_y_libera_stock(
    client: TestClient, auth_headers, admin_headers, product_factory, db
):
    product = product_factory(stock=5)
    _checkout(client, auth_headers, product, qty=2)

    db.expire_all()
    assert db.get(Inventory, product.id).reserved == 2

    res = client.patch(
        "/api/orders/admin/1/status",
        params={"new_status": "cancelled"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"

    db.expire_all()
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 5
    assert inv.reserved == 0


def test_tarea_expira_reservas(
    client: TestClient, auth_headers, product_factory, db, TestingSessionLocal, monkeypatch
):
    """La tarea de Celery libera reservas vencidas (R05)."""
    import app.tasks as tasks

    monkeypatch.setattr(tasks, "SessionLocal", TestingSessionLocal)

    product = product_factory(stock=3)
    _checkout(client, auth_headers, product, qty=2)

    db.expire_all()
    order = db.get(Order, 1)
    order.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    expired = tasks.expire_reservations()
    assert expired == 1

    db.expire_all()
    order = db.get(Order, 1)
    assert order.status == OrderStatus.EXPIRED
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 3
    assert inv.reserved == 0
