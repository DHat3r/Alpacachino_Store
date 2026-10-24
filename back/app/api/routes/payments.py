"""Payment webhook endpoints (idempotent)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException, Header
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentEvent
from app.services import inventory
from app.services.payments import mercadopago
from app.tasks import send_order_confirmation

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/webhook/mercadopago", status_code=200)
async def mercadopago_webhook(
    request: Request,
    x_signature: str | None = Header(None, alias="x-signature"),
    db: Session = Depends(get_db),
):
    body = await request.body()
    # Verify signature if configured
    if settings.MP_WEBHOOK_SECRET and x_signature:
        if not mercadopago.verify_webhook_signature(body, x_signature):
            raise HTTPException(401, "Firma inválida")

    import json
    data = json.loads(body)

    # 1. Idempotency: record event
    payment_id = data.get("data", {}).get("id", data.get("id"))
    if not payment_id:
        return {"status": "no-payment-id"}

    event = PaymentEvent(
        provider="mercadopago",
        external_id=str(payment_id),
        payload=data,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicado-ignorado"}

    # 2. Fetch real payment status from MercadoPago
    try:
        payment_info = mercadopago.get_payment(str(payment_id))
    except Exception as e:
        return {"status": "error-consultando-pasarela", "error": str(e)}

    if payment_info.get("status") != "approved":
        return {"status": "no-aprobado", "payment_status": payment_info.get("status")}

    order_id = int(payment_info.get("external_reference", 0))
    order = db.get(Order, order_id)
    if not order or order.status == OrderStatus.PAID:
        return {"status": "ignorado"}

    # 3. Confirm order and consolidate reservation
    for item in order.items:
        inventory.confirm_reservation(db, str(item.product_id), item.quantity)

    order.status = OrderStatus.PAID
    order.paid_at = datetime.now(timezone.utc)
    db.add(Payment(
        order_id=order.id,
        provider="mercadopago",
        external_id=str(payment_id),
        status="approved",
        amount=order.total,
        raw_response=payment_info,
        confirmed_at=datetime.now(timezone.utc),
    ))
    db.commit()

    # 4. Async email confirmation
    send_order_confirmation.delay(order.id)

    return {"status": "ok"}


@router.post("/webhook/webpay", status_code=200)
async def webpay_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    import json
    data = await request.json()
    token = data.get("token_ws")
    if not token:
        return {"status": "no-token"}

    # Idempotency
    event = PaymentEvent(
        provider="webpay",
        external_id=token,
        payload=data,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicado-ignorado"}

    # Confirm with Webpay
    from app.services.payments import webpay as wp
    try:
        result = wp.confirm_transaction(token)
    except Exception as e:
        return {"status": "error-confirmando", "error": str(e)}

    if result.get("status") != "AUTHORIZED":
        return {"status": "no-autorizado", "wb_status": result.get("status")}

    order_id = int(result.get("buy_order", "ORD-0").replace("ORD-", ""))
    order = db.get(Order, order_id)
    if not order or order.status == OrderStatus.PAID:
        return {"status": "ignorado"}

    for item in order.items:
        inventory.confirm_reservation(db, str(item.product_id), item.quantity)

    order.status = OrderStatus.PAID
    order.paid_at = datetime.now(timezone.utc)
    db.add(Payment(
        order_id=order.id,
        provider="webpay",
        external_id=token,
        status="approved",
        amount=order.total,
        raw_response=result,
        confirmed_at=datetime.now(timezone.utc),
    ))
    db.commit()

    send_order_confirmation.delay(order.id)

    return {"status": "ok"}