"""MercadoPago Checkout Pro integration."""

import mercadopago
from app.core.config import settings

sdk = mercadopago.SDK(settings.MP_ACCESS_TOKEN)


def create_preference(order) -> dict:
    """Create a MercadoPago Checkout Pro preference."""
    items = []
    for item in order.items:
        items.append({
            "title": f"{item.product.title[:50]}" if item.product else f"Pedido #{order.id}",
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "currency_id": "CLP",
        })

    preference = {
        "items": items,
        "external_reference": str(order.id),
        "notification_url": f"{settings.PUBLIC_API_URL}/api/payments/webhook/mercadopago",
        "back_urls": {
            "success": f"{settings.PUBLIC_SITE_URL}/checkout?status=exito",
            "failure": f"{settings.PUBLIC_SITE_URL}/checkout?status=error",
            "pending": f"{settings.PUBLIC_SITE_URL}/checkout?status=pendiente",
        },
        "auto_return": "approved",
        "statement_descriptor": "ALPACACHINO",
    }

    result = sdk.preference().create(preference)
    if result["status"] not in (200, 201):
        raise RuntimeError(f"MercadoPago error: {result}")

    data = result["response"]
    return {
        "init_point": data["init_point"],
        "external_id": data["id"],
    }


def get_payment(payment_id: str) -> dict:
    """Fetch payment details from MercadoPago."""
    result = sdk.payment().get(payment_id)
    if result["status"] != 200:
        raise RuntimeError(f"MercadoPago get_payment error: {result}")
    return result["response"]


def verify_webhook_signature(
    data_id: str, request_id: str | None, signature: str
) -> bool:
    """Verifica la firma `x-signature` de MercadoPago.

    Formato del header: ``ts=1704908010,v1=hash``.
    El hash es HMAC-SHA256 del *manifest*::

        id:<data.id>;request-id:<x-request-id>;ts:<ts>;

    con el secreto del webhook como clave (documentación oficial).
    """
    import hashlib
    import hmac

    if not signature or not settings.MP_WEBHOOK_SECRET:
        return False

    parts: dict[str, str] = {}
    for chunk in signature.split(","):
        key, _, value = chunk.strip().partition("=")
        if key and value:
            parts[key] = value

    ts = parts.get("ts")
    received = parts.get("v1")
    if not ts or not received:
        return False

    manifest = f"id:{data_id};request-id:{request_id or ''};ts:{ts};"
    expected = hmac.new(
        settings.MP_WEBHOOK_SECRET.encode(), manifest.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, received)