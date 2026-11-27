"""Admin panel routes: dashboard, inventory adjustments, user management."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.product import Product, Inventory
from app.models.order import Order, OrderStatus
from app.models.inventory_movement import InventoryMovement, MovementReason
from app.services import inventory as inv_service
from app.schemas.product import ProductOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _=Depends(require_admin)):
    """KPIs for admin dashboard."""
    total_products = db.query(Product).filter(Product.is_active == True).count()
    total_orders = db.query(Order).count()
    pending_orders = db.query(Order).filter(Order.status == OrderStatus.PENDING).count()
    paid_orders = db.query(Order).filter(Order.status == OrderStatus.PAID).count()

    # Revenue this month
    from datetime import datetime, timezone
    first_day = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue = db.query(func.coalesce(func.sum(Order.total), 0)).filter(
        Order.status == OrderStatus.PAID,
        Order.paid_at >= first_day
    ).scalar() or 0

    # Low stock alerts
    low_stock = db.query(Inventory).join(Product).filter(
        Product.is_active == True,
        Inventory.quantity <= 5
    ).count()

    return {
        "total_products": total_products,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "paid_orders": paid_orders,
        "revenue_this_month": int(revenue),
        "low_stock_alerts": low_stock,
    }


@router.get("/inventory/low-stock")
def low_stock(threshold: int = Query(5, ge=0), db: Session = Depends(get_db), _=Depends(require_admin)):
    items = db.query(Inventory).join(Product).filter(
        Product.is_active == True,
        Inventory.quantity <= threshold
    ).all()

    return [
        {
            "product_id": str(i.product_id),
            "sku": i.product.sku,
            "title": i.product.title,
            "available": i.available(),
            "quantity": i.quantity,
            "reserved": i.reserved,
        }
        for i in items
    ]


# Columnas por las que se puede ordenar el inventario. ``total`` es lo que hay
# en bodega: ``quantity`` ya excluye lo reservado.
_INVENTORY_SORT = {
    "title": Product.title,
    "sku": Product.sku,
    "total": Inventory.quantity + Inventory.reserved,
    "reserved": Inventory.reserved,
    "available": Inventory.quantity,
}


@router.get("/inventory")
def list_inventory(
    q: str | None = Query(None, max_length=80, description="Busca en título y SKU"),
    threshold: int | None = Query(
        None, ge=0, description="Solo productos con disponible <= threshold"
    ),
    include_inactive: bool = False,
    sort: str = Query("available", pattern="^(title|sku|total|reserved|available)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=0, le=100, description="0 = todos"),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Inventario completo, paginado y ordenado en el servidor."""
    stmt = db.query(Inventory, Product).join(Product, Inventory.product_id == Product.id)
    if not include_inactive:
        stmt = stmt.filter(Product.is_active.is_(True))
    if threshold is not None:
        stmt = stmt.filter(Inventory.quantity <= threshold)
    if q:
        like = f"%{q}%"
        stmt = stmt.filter(or_(Product.title.ilike(like), Product.sku.ilike(like)))

    column = _INVENTORY_SORT[sort]
    stmt = stmt.order_by(
        column.asc() if order == "asc" else column.desc(), Product.title.asc()
    )

    total = stmt.count()
    if size:
        stmt = stmt.offset((page - 1) * size).limit(size)
    rows = stmt.all()

    return {
        "items": [
            {
                "product_id": str(inv.product_id),
                "sku": product.sku,
                "title": product.title,
                "is_active": product.is_active,
                "quantity": inv.quantity,
                "reserved": inv.reserved,
                "available": inv.available(),
                "total": inv.quantity + inv.reserved,
            }
            for inv, product in rows
        ],
        "total": total,
        "page": page if size else 1,
        "size": size,
    }


@router.patch("/inventory/{product_id}")
def adjust_inventory(
    product_id: str,
    delta: int,
    reason: MovementReason,
    reference: str | None = None,
    db: Session = Depends(get_db),
    user = Depends(require_admin),
):
    """Manual stock adjustment with audit trail."""
    inv = inv_service.adjust_stock(
        db, product_id, delta, reason, reference or f"manual:{product_id}", user.id
    )
    db.commit()
    return {
        "product_id": str(inv.product_id),
        "new_quantity": inv.quantity,
        "reserved": inv.reserved,
        "available": inv.available(),
    }


@router.get("/inventory/movements/{product_id}")
def inventory_movements(
    product_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Audit trail for a product's inventory movements."""
    stmt = (
        db.query(InventoryMovement)
        .filter(InventoryMovement.product_id == product_id)
        .order_by(InventoryMovement.created_at.desc())
    )
    total = stmt.count()
    items = stmt.offset((page - 1) * size).limit(size).all()

    return {
        "items": [
            {
                "id": m.id,
                "delta": m.delta,
                "reason": m.reason.value,
                "reference": m.reference,
                "created_by": m.created_by,
                "created_at": m.created_at,
            }
            for m in items
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/users")
def list_users(
    role: UserRole | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    stmt = db.query(User).order_by(User.created_at.desc())
    if role:
        stmt = stmt.filter(User.role == role)
    total = stmt.count()
    users = stmt.offset((page - 1) * size).limit(size).all()

    return {
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "role": u.role.value,
                "is_active": u.is_active,
                "is_verified": u.is_verified,
                "created_at": u.created_at,
                "last_login": u.last_login,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.patch("/users/{user_id}/role")
def change_user_role(
    user_id: int,
    new_role: UserRole,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
        raise HTTPException(400, "No se puede degradar al admin principal")
    user.role = new_role
    db.commit()
    return {"id": user.id, "role": user.role.value}


@router.patch("/users/{user_id}/toggle-active")
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}