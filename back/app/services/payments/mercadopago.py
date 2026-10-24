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
            "success": f"{settings.PUBLIC_SITE_URL}/checkout/exito",
            "failure": f"{settings.PUBLIC_SITE_URL}/checkout/error",
            "pending": f"{settings.PUBLIC_SITE_URL}/checkout/pendiente",
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


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify MercadoPago webhook signature (x-signature header)."""
    import hmac
    import hashlib
    expected = hmac.new(
        settings.MP_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)