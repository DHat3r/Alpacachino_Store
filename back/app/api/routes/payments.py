"""Payment webhook endpoints (idempotent)."""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Depends, HTTPException, Header
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentEvent
from app.services import inventory
from app.services.payments import mercadopago
from app.tasks import send_order_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


def _confirm_order(
    db: Session,
    order: Order,
    provider: str,
    external_id: str,
    amount,
    raw: dict,
) -> bool:
    """Marca el pedido como pagado y consolida la reserva (idempotente)."""
    if not order or order.status == OrderStatus.PAID:
        return False

    for item in order.items:
        inventory.confirm_reservation(db, str(item.product_id), item.quantity)

    order.status = OrderStatus.PAID
    order.paid_at = datetime.now(timezone.utc)
    order.expires_at = None
    db.add(
        Payment(
            order_id=order.id,
            provider=provider,
            external_id=external_id,
            status="approved",
            amount=amount,
            raw_response=raw,
            confirmed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    try:
        send_order_confirmation.delay(order.id)
    except Exception:  # pragma: no cover - broker caído no debe romper el webhook
        logger.warning("No se pudo encolar el correo de confirmación", exc_info=True)
    return True


@router.post("/webhook/mercadopago", status_code=200)
async def mercadopago_webhook(
    request: Request,
    x_signature: str | None = Header(None, alias="x-signature"),
    x_request_id: str | None = Header(None, alias="x-request-id"),
    db: Session = Depends(get_db),
):
    body = await request.body()
    data = json.loads(body or b"{}")

    payment_id = data.get("data", {}).get("id", data.get("id"))
    payment_id = payment_id or request.query_params.get("data.id")
    if not payment_id:
        return {"status": "no-payment-id"}

    # Verificación de firma según MercadoPago (1.5/A5).
    if settings.MP_WEBHOOK_SECRET:
        if not x_signature:
            raise HTTPException(401, "Falta la cabecera x-signature")
        if not mercadopago.verify_webhook_signature(
            data_id=str(payment_id),
            request_id=x_request_id,
            signature=x_signature,
        ):
            raise HTTPException(401, "Firma inválida")

    # Idempotencia: registra el evento antes de procesar.
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

    _confirm_order(
        db,
        order,
        provider="mercadopago",
        external_id=str(payment_id),
        amount=order.total,
        raw=payment_info,
    )
    return {"status": "ok"}


async def _handle_webpay(request: Request, db: Session):
    """Retorno de Webpay: Transbank envía al navegador con `token_ws`.

    Puede llegar por GET (query), por POST de formulario o como JSON (pruebas).
    Si el cliente anula el pago llega `TBK_TOKEN` sin `token_ws`.
    """
    params = dict(request.query_params)
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("application/json"):
        data = await request.json()
    elif content_type.startswith(("application/x-www-form-urlencoded", "multipart/form-data")):
        data = dict(await request.form())
    else:
        data = {}

    token = data.get("token_ws") or params.get("token_ws")
    aborted = data.get("TBK_TOKEN") or params.get("TBK_TOKEN")
    site = settings.PUBLIC_SITE_URL

    if aborted and not token:
        return RedirectResponse(f"{site}/checkout?status=error", status_code=303)
    if not token:
        return RedirectResponse(f"{site}/checkout?status=error", status_code=303)

    # Idempotencia
    event = PaymentEvent(provider="webpay", external_id=token, payload=data or params)
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return RedirectResponse(f"{site}/checkout?status=exito", status_code=303)

    from app.services.payments import webpay as wp

    try:
        result = wp.confirm_transaction(token)
    except Exception as exc:
        logger.exception("Webpay commit falló: %s", exc)
        return RedirectResponse(f"{site}/checkout?status=error", status_code=303)

    if result.get("status") != "AUTHORIZED":
        return RedirectResponse(f"{site}/checkout?status=error", status_code=303)

    order_id = int(str(result.get("buy_order", "ORD-0")).replace("ORD-", ""))
    order = db.get(Order, order_id)
    if not order:
        return RedirectResponse(f"{site}/checkout?status=error", status_code=303)

    _confirm_order(
        db,
        order,
        provider="webpay",
        external_id=token,
        amount=order.total,
        raw=result,
    )
    return RedirectResponse(f"{site}/checkout?status=exito", status_code=303)


@router.get("/webhook/webpay", status_code=200)
async def webpay_webhook_get(request: Request, db: Session = Depends(get_db)):
    """Retorno GET de Webpay Plus."""
    return await _handle_webpay(request, db)


@router.post("/webhook/webpay", status_code=200)
async def webpay_webhook_post(request: Request, db: Session = Depends(get_db)):
    """Retorno POST (formulario) de Webpay Plus."""
    return await _handle_webpay(request, db)
