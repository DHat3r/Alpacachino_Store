"""Pruebas de inventario: concurrencia, ajustes y auditoría (R05)."""

import threading

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.inventory_movement import InventoryMovement, MovementReason
from app.models.product import Inventory
from app.services import inventory as inv_service


def test_reserva_concurrente_no_sobrevende(product_factory, TestingSessionLocal):
    """Dos compradores simultáneos por la última unidad: solo uno gana."""
    product = product_factory(stock=1)

    results: list[str] = []
    barrier = threading.Barrier(2)

    def buy():
        session = TestingSessionLocal()
        try:
            barrier.wait(timeout=5)
            inv_service.reserve_stock(session, product.id, 1)
            session.commit()
            results.append("ok")
        except HTTPException:
            session.rollback()
            results.append("conflict")
        finally:
            session.close()

    threads = [threading.Thread(target=buy) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert sorted(results) == ["conflict", "ok"]

    check = TestingSessionLocal()
    try:
        inv = check.get(Inventory, product.id)
        assert inv.quantity == 0
        assert inv.reserved == 1
    finally:
        check.close()


def test_liberar_reserva(product_factory, db: Session):
    product = product_factory(stock=5)

    inv_service.reserve_stock(db, product.id, 2)
    db.commit()
    db.expire_all()
    assert db.get(Inventory, product.id).quantity == 3

    inv_service.release_stock(db, product.id, 2)
    db.commit()
    db.expire_all()

    inv = db.get(Inventory, product.id)
    assert inv.quantity == 5
    assert inv.reserved == 0


def test_confirmar_reserva_descuenta_reservado(product_factory, db: Session):
    product = product_factory(stock=5)
    inv_service.reserve_stock(db, product.id, 2)
    db.commit()

    inv_service.confirm_reservation(db, product.id, 2)
    db.commit()
    db.expire_all()

    inv = db.get(Inventory, product.id)
    assert inv.quantity == 3
    assert inv.reserved == 0
    assert inv.available() == 3


def test_ajuste_manual_y_auditoria(product_factory, db: Session, customer):
    product = product_factory(stock=5)

    inv = inv_service.adjust_stock(
        db, product.id, delta=4, reason="restock", reference="oc-123", user_id=customer.id
    )
    db.commit()
    assert inv.quantity == 9

    movements = (
        db.query(InventoryMovement)
        .filter(InventoryMovement.product_id == product.id)
        .all()
    )
    assert len(movements) == 1
    assert movements[0].delta == 4
    assert movements[0].reason == MovementReason.RESTOCK
    assert movements[0].created_by == customer.id


def test_ajuste_negativo_invalido(product_factory, db: Session):
    product = product_factory(stock=2)
    with pytest.raises(HTTPException) as exc:
        inv_service.adjust_stock(db, product.id, delta=-5, reason="ajuste", reference="x")
    assert exc.value.status_code == 400
    db.rollback()


def test_ajuste_producto_inexistente(db: Session):
    import uuid

    with pytest.raises(HTTPException) as exc:
        inv_service.adjust_stock(
            db, uuid.uuid4(), delta=1, reason="ajuste", reference="x"
        )
    assert exc.value.status_code == 404
