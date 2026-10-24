"""Configuración pública para el frontend (2.8)."""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("", response_model=dict)
def public_config() -> dict:
    """Datos de negocio que el cliente no debe tener escritos a mano."""
    provider = settings.PAYMENT_PROVIDER.lower()
    return {
        "currency": settings.CURRENCY,
        "shipping_cost": settings.SHIPPING_COST,
        "free_shipping_from": settings.FREE_SHIPPING_FROM,
        "reservation_minutes": settings.STOCK_RESERVATION_MINUTES,
        "payment_provider": provider,
        "terms_version": settings.TERMS_VERSION,
        "seller": {
            "name": settings.SELLER_NAME,
            "email": settings.SELLER_EMAIL,
            "phone": settings.SELLER_PHONE,
        },
        "payment_instructions": (
            settings.manual_payment_instructions if provider == "manual" else None
        ),
    }
