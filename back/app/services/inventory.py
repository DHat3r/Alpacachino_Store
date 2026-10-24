"""Inventory service: atomic stock operations to prevent overselling (R05)."""

from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status
from sqlalchemy import text, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.product import Product, Inventory
from app.models.order import Order, OrderStatus
from app.models.inventory_movement import InventoryMovement


def reserve_stock(db: Session, product_id: str, qty: int) -> None:
    """
    Atomically reserve stock for an order.
    Uses PostgreSQL row-level locking to prevent overselling (R05).
    """
    result = db.execute(
        text("""
            UPDATE inventory
               SET quantity = quantity - :qty,
                   reserved = reserved + :qty,
                   updated_at = now()
             WHERE product_id = :pid
               AND quantity >= :qty
        """),
        {"qty": qty, "pid": product_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock insuficiente para uno de los productos del carrito",
        )

    # Log the movement
    movement = InventoryMovement(
        product_id=product_id,
        delta=-qty,
        reason="reservation",
        reference=f"reserve:{product_id}",
    )
    db.add(movement)


def confirm_reservation(db: Session, product_id: str, qty: int) -> None:
    """
    Confirm stock reservation after successful payment.
    The reserved quantity becomes a permanent deduction.
    """
    db.execute(
        text("""
            UPDATE inventory
               SET reserved = GREATEST(reserved - :qty, 0),
                   updated_at = now()
             WHERE product_id = :pid
        """),
        {"qty": qty, "pid": product_id},
    )

    movement = InventoryMovement(
        product_id=product_id,
        delta=0,  # Already deducted at reservation
        reason="sale_confirmed",
        reference=f"order:{product_id}",
    )
    db.add(movement)


def release_stock(db: Session, product_id: str, qty: int) -> None:
    """
    Release reserved stock (payment failed, expired, or cancelled).
    Returns the quantity to available stock.
    """
    db.execute(
        text("""
            UPDATE inventory
               SET quantity = quantity + :qty,
                   reserved = GREATEST(reserved - :qty, 0),
                   updated_at = now()
             WHERE product_id = :pid
        """),
        {"qty": qty, "pid": product_id},
    )

    movement = InventoryMovement(
        product_id=product_id,
        delta=qty,
        reason="reservation_released",
        reference=f"release:{product_id}",
    )
    db.add(movement)


def adjust_stock(db: Session, product_id: str, delta: int, reason: str, reference: str, user_id: int | None = None) -> Inventory:
    """
    Manual stock adjustment by admin (restock, correction, etc.).
    Always creates an audit trail via InventoryMovement.
    """
    inv = db.get(Inventory, product_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Inventario no encontrado")

    new_qty = inv.quantity + delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="El ajuste resultaría en stock negativo")

    inv.quantity = new_qty
    inv.updated_at = datetime.now(timezone.utc)

    movement = InventoryMovement(
        product_id=product_id,
        delta=delta,
        reason=reason,
        reference=reference,
        created_by=user_id,
    )
    db.add(movement)
    db.flush()
    return inv


def next_expiration() -> datetime:
    """Calculate order expiration timestamp."""
    return datetime.now(timezone.utc) + timedelta(minutes=settings.STOCK_RESERVATION_MINUTES)


def get_low_stock(threshold: int = 5) -> list[Inventory]:
    """Get products with low available stock."""
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        return db.execute(
            select(Inventory)
            .join(Product)
            .where(Product.is_active == True)
            .where((Inventory.quantity - Inventory.reserved) <= threshold)
        ).scalars().all()
    finally:
        db.close()