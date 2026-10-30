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
