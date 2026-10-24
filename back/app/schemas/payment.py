"""Payment schemas."""

from pydantic import BaseModel, ConfigDict
from typing import Optional


class PaymentInitOut(BaseModel):
    payment_url: str
    external_id: str


class PaymentWebhook(BaseModel):
    # Generic webhook - provider-specific fields handled in route
    pass