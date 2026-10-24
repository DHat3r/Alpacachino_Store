"""Payment provider factory (Strategy pattern)."""

from app.core.config import settings
from app.services.payments import mercadopago, webpay


def create_payment_preference(order) -> dict:
    """Create a payment preference for the configured provider.

    ``manual`` (transferencia) no crea preferencia: devuelve los datos
    bancarios del vendedor para mostrarlos en el checkout.
    """
    provider = settings.PAYMENT_PROVIDER.lower()
    if provider == "manual":
        return {
            "init_point": None,
            "external_id": None,
            "instructions": settings.manual_payment_instructions,
        }
    if provider == "webpay":
        return webpay.create_transaction(order)
    return mercadopago.create_preference(order)


def confirm_payment(provider: str, external_id: str, amount: int) -> dict:
    """Confirm payment status with the provider."""
    if provider == "webpay":
        return webpay.confirm_transaction(external_id)
    return mercadopago.get_payment(external_id)
