"""API package."""

from app.api.routes import (
    products,
    health,
    config,
)

__all__ = [
    "products",
    "health",
    "config",
]