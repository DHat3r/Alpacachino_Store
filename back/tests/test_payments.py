"""Pruebas de webhooks de pago: idempotencia y confirmación de pedido (RF-05)."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentEvent
from app.models.product import Inventory


@pytest.fixture(autouse=True)
def fake_payment_gateway(monkeypatch):
    """Simula la creación de preferencia y el envío de correo."""
    monkeypatch.setattr(
        "app.api.routes.orders.create_payment_preference",
        lambda order: {"init_point": "https://sandbox.pago.test/123", "external_id": "ext-123"},
    )
    # Evita encolar tareas en Celery durante los tests
    monkeypatch.setattr(
        "app.api.routes.payments.send_order_confirmation",
        SimpleNamespace(delay=lambda *a, **k: None),
    )


def _create_pending_order(client: TestClient, auth_headers, product, qty: int = 1) -> int:
    res = client.post(
        "/api/orders/checkout",
        headers=auth_headers,
        json={
            "items": [{"product_id": str(product.id), "quantity": qty}],
            "shipping_address": "Av. Siempre Viva 742, Santiago",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["order_id"]


def test_webhook_aprobado_confirma_pedido(
    client: TestClient, auth_headers, product_factory, db, monkeypatch
):
    product = product_factory(stock=4)
    order_id = _create_pending_order(client, auth_headers, product, qty=2)

    monkeypatch.setattr(
        "app.api.routes.payments.mercadopago.get_payment",
        lambda payment_id: {
            "status": "approved",
            "external_reference": str(order_id),
            "id": payment_id,
        },
    )

    res = client.post(
        "/api/payments/webhook/mercadopago", json={"data": {"id": "987654"}}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    db.expire_all()
    order = db.get(Order, order_id)
    assert order.status == OrderStatus.PAID
    assert order.paid_at is not None

    inv = db.get(Inventory, product.id)
    assert inv.quantity == 2
    assert inv.reserved == 0

    assert db.query(Payment).count() == 1
    assert db.query(PaymentEvent).count() == 1


def test_webhook_duplicado_es_idempotente(
    client: TestClient, auth_headers, product_factory, db, monkeypatch
):
    product = product_factory(stock=4)
    order_id = _create_pending_order(client, auth_headers, product)

    monkeypatch.setattr(
        "app.api.routes.payments.mercadopago.get_payment",
        lambda payment_id: {
            "status": "approved",
            "external_reference": str(order_id),
            "id": payment_id,
        },
    )

    payload = {"data": {"id": "111222"}}
    first = client.post("/api/payments/webhook/mercadopago", json=payload)
    second = client.post("/api/payments/webhook/mercadopago", json=payload)

    assert first.json()["status"] == "ok"
    assert second.json()["status"] == "duplicado-ignorado"
    assert db.query(PaymentEvent).count() == 1
    assert db.query(Payment).count() == 1


def test_webhook_no_aprobado_no_cambia_pedido(
    client: TestClient, auth_headers, product_factory, db, monkeypatch
):
    product = product_factory(stock=4)
    order_id = _create_pending_order(client, auth_headers, product)

    monkeypatch.setattr(
        "app.api.routes.payments.mercadopago.get_payment",
        lambda payment_id: {
            "status": "rejected",
            "external_reference": str(order_id),
            "id": payment_id,
        },
    )

    res = client.post(
        "/api/payments/webhook/mercadopago", json={"data": {"id": "555"}}
    )
    assert res.json()["status"] == "no-aprobado"

    db.expire_all()
    assert db.get(Order, order_id).status == OrderStatus.PENDING
    assert db.get(Inventory, product.id).reserved == 1


def test_webhook_sin_payment_id(client: TestClient):
    res = client.post("/api/payments/webhook/mercadopago", json={"data": {}})
    assert res.status_code == 200
    assert res.json()["status"] == "no-payment-id"
