"""Transbank Webpay Plus integration."""

from transbank.webpay.webpay_plus.transaction import Transaction
from app.core.config import settings

# Transbank SDK v6: build_for_integration only takes commerce_code and api_key
tx = Transaction.build_for_integration(
    commerce_code=settings.WEBPAY_COMMERCE_CODE,
    api_key=settings.WEBPAY_API_KEY,
)


def create_transaction(order) -> dict:
    """Create a Webpay Plus transaction."""
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
    """Confirm a Webpay transaction."""
    response = tx.commit(token)
    return response


def get_transaction_status(token: str) -> dict:
    """Get Webpay transaction status."""
    response = tx.status(token)
    return response