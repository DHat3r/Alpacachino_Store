"""Pruebas del latido de base de datos (keepalive de stock)."""

from sqlalchemy.orm import sessionmaker

from app.services import keepalive


def test_check_stock_once_resume_inventario(
    TestingSessionLocal: sessionmaker, product_factory
):
    product_factory(sku="KEEP-001", stock=7)

    summary = keepalive.check_stock_once(TestingSessionLocal)

    assert summary == {"products": 1, "available": 7, "inconsistent": 0}


def test_check_stock_once_detecta_reservas_incoherentes(
    TestingSessionLocal: sessionmaker, product_factory
):
    # Reservado sin ningún pedido pendiente que lo respalde.
    product_factory(sku="KEEP-002", stock=4, reserved=3)

    summary = keepalive.check_stock_once(TestingSessionLocal)

    assert summary["inconsistent"] == 1
    assert summary["available"] == 4


def test_snapshot_tiene_la_forma_esperada():
    snap = keepalive.snapshot()

    assert set(snap) == {
        "enabled",
        "interval_seconds",
        "checks",
        "failures",
        "last_check_at",
        "last_ok_at",
        "last_error",
        "stock",
        "supabase",
    }
    assert set(snap["stock"]) == {"products", "available", "inconsistent"}
    assert set(snap["supabase"]) == {
        "configured",
        "ok",
        "latency_ms",
        "last_check_at",
        "last_error",
    }


def test_check_stock_once_reserva_de_checkout_es_coherente(
    TestingSessionLocal: sessionmaker, client, auth_headers, product_factory, monkeypatch
):
    monkeypatch.setattr(
        "app.api.routes.orders.create_payment_preference",
        lambda order: {"init_point": "https://sandbox.pago.test/1", "external_id": "ext-1"},
    )
    product = product_factory(sku="KEEP-003", stock=10)
    res = client.post(
        "/api/orders/checkout",
        json={
            "items": [{"product_id": str(product.id), "quantity": 2}],
            "shipping_address": "Av. Siempre Viva 742, Santiago",
        },
        headers=auth_headers,
    )
    assert res.status_code == 201, res.text

    summary = keepalive.check_stock_once(TestingSessionLocal)

    assert summary == {"products": 1, "available": 8, "inconsistent": 0}
