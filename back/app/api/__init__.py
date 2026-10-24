"""API package."""

from app.api.routes import (
    auth,
    products,
    orders,
    payments,
    admin,
    forum,
    webhooks,
    health,
)

__all__ = [
    "auth",
    "products",
    "orders",
    "payments",
    "admin",
    "forum",
    "webhooks",
    "health",
]