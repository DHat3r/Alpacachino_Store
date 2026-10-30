"""Product and Category schemas."""

from pydantic import BaseModel, ConfigDict, computed_field
from typing import Optional
from decimal import Decimal
from datetime import datetime
import uuid


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


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
        """Stock realmente comprable: ``quantity`` ya excluye lo reservado."""
        return max(self.inventory_quantity, 0)


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    size: int