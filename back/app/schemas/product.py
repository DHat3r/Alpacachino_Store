"""Product and Category schemas."""

from pydantic import BaseModel, Field, ConfigDict, computed_field
from typing import Optional
from decimal import Decimal
from datetime import datetime
import uuid


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = None


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    author: Optional[str] = Field(default=None, max_length=120)
    publisher: Optional[str] = Field(default=None, max_length=120)
    isbn: Optional[str] = Field(default=None, max_length=20)
    description: Optional[str] = None
    price: Decimal = Field(ge=0)
    cover_url: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[uuid.UUID] = None
    stock: int = Field(default=0, ge=0)


class ProductUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    author: Optional[str] = Field(default=None, max_length=120)
    publisher: Optional[str] = Field(default=None, max_length=120)
    isbn: Optional[str] = Field(default=None, max_length=20)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, ge=0)
    cover_url: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: uuid.UUID
    sku: str
    title: str
    author: Optional[str]
    publisher: Optional[str]
    isbn: Optional[str]
    description: Optional[str]
    price: Decimal
    cover_url: Optional[str]
    category_id: Optional[uuid.UUID]
    category: Optional[CategoryOut]
    inventory_quantity: int = 0
    inventory_reserved: int = 0
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def available_stock(self) -> int:
        """Stock realmente comprable (total menos reservas activas)."""
        return max(self.inventory_quantity - self.inventory_reserved, 0)


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    size: int