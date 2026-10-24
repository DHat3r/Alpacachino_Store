"""Order and Checkout schemas."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from decimal import Decimal
from datetime import datetime
from app.models.order import OrderStatus


class CheckoutItem(BaseModel):
    product_id: str  # UUID as string
    quantity: int = Field(ge=1)


class CheckoutRequest(BaseModel):
    items: list[CheckoutItem] = Field(min_length=1)
    shipping_address: str = Field(min_length=10, max_length=400)


class OrderItemOut(BaseModel):
    id: int
    product_id: str
    quantity: int
    unit_price: Decimal

    model_config = ConfigDict(from_attributes=True)


class OrderOut(BaseModel):
    id: int
    user_id: int
    status: OrderStatus
    subtotal: Decimal
    shipping: Decimal
    total: Decimal
    shipping_address: Optional[str]
    shipping_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime]
    paid_at: Optional[datetime]
    items: list[OrderItemOut]

    model_config = ConfigDict(from_attributes=True)


class OrderPage(BaseModel):
    items: list[OrderOut]
    total: int
    page: int
    size: int