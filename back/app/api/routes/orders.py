"""API routes for orders: checkout, history, admin management."""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment
from app.models.product import Product
from app.models.user import User
from app.schemas.order import CheckoutRequest, OrderOut, OrderPage, OrderItemOut
from app.services import inventory
from app.services.payments.factory import create_payment_preference

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])

# Transiciones de estado permitidas (1.1). Cualquier otra devuelve 409.
ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {
        OrderStatus.PAID,
        OrderStatus.FAILED,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
    },
    OrderStatus.PAID: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED},
    OrderStatus.FAILED: set(),
    OrderStatus.EXPIRED: set(),
    OrderStatus.CANCELLED: set(),
    OrderStatus.DELIVERED: set(),
}


def _item_out(item: OrderItem) -> OrderItemOut:
    product = item.product
    return OrderItemOut(
        id=item.id,
        product_id=str(item.product_id),
        sku=product.sku if product else None,
        title=product.title if product else None,
        cover_url=product.cover_url if product else None,
        quantity=item.quantity,
        unit_price=item.unit_price,
    )


def _order_out(order: Order) -> OrderOut:
    return OrderOut(
        id=order.id,
        user_id=order.user_id,
        status=order.status,
        subtotal=order.subtotal,
        shipping=order.shipping,
        total=order.total,
        shipping_address=order.shipping_address,
        shipping_name=order.shipping_name,
        shipping_phone=order.shipping_phone,
        shipping_region=order.shipping_region,
        shipping_comuna=order.shipping_comuna,
        shipping_notes=order.shipping_notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
        expires_at=order.expires_at,
        paid_at=order.paid_at,
        items=[_item_out(i) for i in order.items],
    )


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
        shipping = (
            Decimal(0)
            if subtotal >= settings.FREE_SHIPPING_FROM
            else Decimal(settings.SHIPPING_COST)
        )
        total = subtotal + shipping

        # ─── 3. Create order with expiration ───
        order = Order(
            user_id=user.id,
            status=OrderStatus.PENDING,
            subtotal=subtotal,
            shipping=shipping,
            total=total,
            shipping_address=payload.shipping_address,
            shipping_name=payload.shipping_name,
            shipping_phone=payload.shipping_phone,
            shipping_region=payload.shipping_region,
            shipping_comuna=payload.shipping_comuna,
            shipping_notes=payload.shipping_notes,
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
    provider = settings.PAYMENT_PROVIDER.lower()
    payment_url = None
    external_id = None
    payment_token = None
    instructions = None
    try:
        preference = create_payment_preference(order)
        payment_url = preference.get("init_point")
        external_id = preference.get("external_id")
        payment_token = preference.get("token")
        instructions = preference.get("instructions")
    except Exception as exc:  # pragma: no cover - depende de la pasarela
        logger.warning("No se pudo crear la preferencia de pago: %s", exc)

    if instructions is None and payment_url is None:
        instructions = settings.manual_payment_instructions

    return {
        "order_id": order.id,
        "payment_provider": provider,
        "payment_url": payment_url,
        "payment_token": payment_token,
        "external_id": external_id,
        "payment_instructions": instructions,
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

    return OrderPage(
        items=[_order_out(o) for o in items], total=total, page=page, size=size
    )


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id, Order.user_id == user.id)
        .first()
    )

    if not order:
        raise HTTPException(404, "Pedido no encontrado")

    return _order_out(order)


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """El cliente cancela su propio pedido mientras siga pendiente (2.5)."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == order_id, Order.user_id == user.id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            409, "Solo puedes cancelar un pedido pendiente de pago"
        )

    for item in order.items:
        inventory.release_stock(db, str(item.product_id), item.quantity)

    order.status = OrderStatus.CANCELLED
    db.commit()
    db.refresh(order)
    return _order_out(order)


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

    return OrderPage(
        items=[_order_out(o) for o in items], total=total, page=page, size=size
    )


@router.patch("/admin/{order_id}/status", response_model=OrderOut)
def update_order_status(
    order_id: int,
    new_status: OrderStatus,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Pedido no encontrado")

    if new_status == order.status:
        return _order_out(order)

    allowed = ALLOWED_TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise HTTPException(
            409,
            f"No se puede pasar de '{order.status.value}' a '{new_status.value}'",
        )

    # ── Efectos sobre el stock ──
    if order.status == OrderStatus.PENDING and new_status == OrderStatus.PAID:
        # La reserva se consolida y se registra el pago manual.
        for item in order.items:
            inventory.confirm_reservation(db, str(item.product_id), item.quantity)
        db.add(
            Payment(
                order_id=order.id,
                provider="manual",
                external_id=f"manual-{order.id}",
                status="approved",
                amount=order.total,
                raw_response={"confirmed_by": "admin"},
                confirmed_at=datetime.now(timezone.utc),
            )
        )
        order.paid_at = datetime.now(timezone.utc)
        order.expires_at = None

    elif order.status == OrderStatus.PENDING and new_status in (
        OrderStatus.FAILED,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
    ):
        for item in order.items:
            inventory.release_stock(db, str(item.product_id), item.quantity)

    elif order.status == OrderStatus.PAID and new_status == OrderStatus.CANCELLED:
        # Las unidades ya estaban descontadas: se reponen con auditoría.
        for item in order.items:
            inventory.restore_sold_stock(
                db, str(item.product_id), item.quantity, f"order:{order.id}"
            )

    order.status = new_status
    db.commit()
    db.refresh(order)

    return _order_out(order)
