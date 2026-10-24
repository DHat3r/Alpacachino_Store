"""API routes for orders: checkout, history, admin management."""

import logging
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.order import CheckoutRequest, OrderOut, OrderPage, OrderItemOut
from app.services import inventory
from app.services.payments.factory import create_payment_preference

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/checkout", response_model=dict, status_code=201)
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(422, "El carrito está vacío")

    # ─── 1. Validate products and reserve stock atomically ───
    products: dict[uuid.UUID, Product] = {}
    try:
        for item in payload.items:
            try:
                pid = uuid.UUID(item.product_id)
            except (ValueError, AttributeError):
                raise HTTPException(400, f"Identificador de producto inválido: {item.product_id}")

            product = db.get(Product, pid)
            if not product or not product.is_active:
                raise HTTPException(404, f"Producto {item.product_id} no disponible")

            # Check available stock (pre-chequeo amistoso; la reserva atómica manda)
            available = product.inventory.available() if product.inventory else 0
            if available < item.quantity:
                raise HTTPException(
                    409,
                    f"Stock insuficiente para {product.title} (disponible: {available})",
                )

            products[pid] = product
            # Atomic reservation (UPDATE ... WHERE quantity >= :qty)
            inventory.reserve_stock(db, pid, item.quantity)

        # ─── 2. Calculate totals with server-side prices ───
        subtotal = sum(
            products[uuid.UUID(item.product_id)].price * item.quantity
            for item in payload.items
        )
        shipping = Decimal(0) if subtotal >= 30000 else Decimal(3500)
        total = subtotal + shipping

        # ─── 3. Create order with expiration ───
        order = Order(
            user_id=user.id,
            status=OrderStatus.PENDING,
            subtotal=subtotal,
            shipping=shipping,
            total=total,
            shipping_address=payload.shipping_address,
            expires_at=inventory.next_expiration(),
        )
        db.add(order)
        db.flush()

        for item in payload.items:
            pid = uuid.UUID(item.product_id)
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=pid,
                    quantity=item.quantity,
                    unit_price=products[pid].price,
                )
            )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Error procesando el pedido")
        raise HTTPException(500, "Error procesando el pedido") from e

    # ─── 4. Create payment preference ───
    # Si la pasarela no está configurada o falla, el pedido ya quedó reservado:
    # se devuelve sin URL de pago para que el cliente pueda reintentar.
    try:
        preference = create_payment_preference(order)
        payment_url = preference.get("init_point")
        external_id = preference.get("external_id")
    except Exception as exc:  # pragma: no cover - depende de la pasarela
        logger.warning("No se pudo crear la preferencia de pago: %s", exc)
        payment_url = None
        external_id = None

    return {
        "order_id": order.id,
        "payment_url": payment_url,
        "external_id": external_id,
    }


@router.get("", response_model=OrderPage)
def list_my_orders(
    status: OrderStatus | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
    )
    if status:
        stmt = stmt.filter(Order.status == status)

    total = stmt.count()
    items = stmt.offset((page - 1) * size).limit(size).all()

    out = []
    for o in items:
        out.append(OrderOut(
            id=o.id,
            user_id=o.user_id,
            status=o.status,
            subtotal=o.subtotal,
            shipping=o.shipping,
            total=o.total,
            shipping_address=o.shipping_address,
            shipping_notes=o.shipping_notes,
            created_at=o.created_at,
            updated_at=o.updated_at,
            expires_at=o.expires_at,
            paid_at=o.paid_at,
            items=[OrderItemOut(
                id=i.id,
                product_id=str(i.product_id),
                quantity=i.quantity,
                unit_price=i.unit_price
            ) for i in o.items]
        ))

    return OrderPage(items=out, total=total, page=page, size=size)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id, Order.user_id == user.id).first()

    if not order:
        raise HTTPException(404, "Pedido no encontrado")

    return OrderOut(
        id=order.id,
        user_id=order.user_id,
        status=order.status,
        subtotal=order.subtotal,
        shipping=order.shipping,
        total=order.total,
        shipping_address=order.shipping_address,
        shipping_notes=order.shipping_notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
        expires_at=order.expires_at,
        paid_at=order.paid_at,
        items=[OrderItemOut(
            id=i.id,
            product_id=str(i.product_id),
            quantity=i.quantity,
            unit_price=i.unit_price
        ) for i in order.items]
    )


# ─── Admin routes ───

@router.get("/admin/all", response_model=OrderPage)
def list_all_orders(
    status: OrderStatus | None = None,
    user_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    stmt = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.created_at.desc())
    )
    if status:
        stmt = stmt.filter(Order.status == status)
    if user_id:
        stmt = stmt.filter(Order.user_id == user_id)

    total = stmt.count()
    items = stmt.offset((page - 1) * size).limit(size).all()

    out = []
    for o in items:
        out.append(OrderOut(
            id=o.id,
            user_id=o.user_id,
            status=o.status,
            subtotal=o.subtotal,
            shipping=o.shipping,
            total=o.total,
            shipping_address=o.shipping_address,
            shipping_notes=o.shipping_notes,
            created_at=o.created_at,
            updated_at=o.updated_at,
            expires_at=o.expires_at,
            paid_at=o.paid_at,
            items=[OrderItemOut(
                id=i.id,
                product_id=str(i.product_id),
                quantity=i.quantity,
                unit_price=i.unit_price
            ) for i in o.items]
        ))

    return OrderPage(items=out, total=total, page=page, size=size)


@router.patch("/admin/{order_id}/status", response_model=OrderOut)
def update_order_status(
    order_id: int,
    new_status: OrderStatus,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Pedido no encontrado")

    # Handle stock implications
    if order.status == OrderStatus.PENDING and new_status in (OrderStatus.CANCELLED, OrderStatus.EXPIRED):
        for item in order.items:
            inventory.release_stock(db, str(item.product_id), item.quantity)

    order.status = new_status
    if new_status == OrderStatus.PAID:
        from datetime import datetime, timezone
        order.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)

    return OrderOut(
        id=order.id,
        user_id=order.user_id,
        status=order.status,
        subtotal=order.subtotal,
        shipping=order.shipping,
        total=order.total,
        shipping_address=order.shipping_address,
        shipping_notes=order.shipping_notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
        expires_at=order.expires_at,
        paid_at=order.paid_at,
        items=[OrderItemOut(
            id=i.id,
            product_id=str(i.product_id),
            quantity=i.quantity,
            unit_price=i.unit_price
        ) for i in order.items]
    )