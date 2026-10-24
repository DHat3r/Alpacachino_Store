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
    shipping_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    shipping_phone: Optional[str] = Field(default=None, min_length=6, max_length=30)
    shipping_region: Optional[str] = Field(default=None, max_length=80)
    shipping_comuna: Optional[str] = Field(default=None, max_length=80)
    shipping_notes: Optional[str] = Field(default=None, max_length=400)


class OrderItemOut(BaseModel):
    id: int
    product_id: str
    sku: Optional[str] = None
    title: Optional[str] = None
    cover_url: Optional[str] = None
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
    shipping_name: Optional[str] = None
    shipping_phone: Optional[str] = None
    shipping_region: Optional[str] = None
    shipping_comuna: Optional[str] = None
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
