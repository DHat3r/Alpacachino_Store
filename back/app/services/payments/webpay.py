"""Transbank Webpay Plus integration."""

from transbank.webpay.webpay_plus.transaction import Transaction
from app.core.config import settings


def _transaction():
    """Devuelve la transacción según WEBPAY_ENV (integration | production)."""
    if settings.WEBPAY_ENV.lower() == "production":
        return Transaction.build_for_production(
            commerce_code=settings.WEBPAY_COMMERCE_CODE,
            api_key=settings.WEBPAY_API_KEY,
        )
    return Transaction.build_for_integration(
        commerce_code=settings.WEBPAY_COMMERCE_CODE,
        api_key=settings.WEBPAY_API_KEY,
    )


def create_transaction(order) -> dict:
    """Crea una transacción Webpay Plus y devuelve URL + token."""
    tx = _transaction()
    response = tx.create(
        buy_order=f"ORD-{order.id}",
        session_id=f"SES-{order.id}",
        amount=float(order.total),
        return_url=f"{settings.PUBLIC_API_URL}/api/payments/webhook/webpay",
    )
    return {
        "init_point": response["url"],
        "token": response["token"],
        "external_id": response["token"],
    }


def confirm_transaction(token: str) -> dict:
    """Confirma (commit) una transacción Webpay."""
    return _transaction().commit(token)


def get_transaction_status(token: str) -> dict:
    """Consulta el estado de una transacción Webpay."""
    return _transaction().status(token)
