"""Product, Category, and Inventory models."""

import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    String, Text, Numeric, ForeignKey, DateTime, CheckConstraint, Index, func, Boolean
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    products: Mapped[list["Product"]] = relationship(back_populates="category", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Category {self.name}>"


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    author: Mapped[str | None] = mapped_column(String(120), nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(120), nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 0), nullable=False)  # CLP sin decimales
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    category: Mapped[Category | None] = relationship(back_populates="products")
    inventory: Mapped["Inventory"] = relationship(
        back_populates="product", uselist=False, cascade="all, delete-orphan"
    )
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="product")

    __table_args__ = (
        Index("ix_products_search", "title", "author"),
        CheckConstraint("price >= 0", name="ck_products_price_positive"),
    )

    def __repr__(self) -> str:
        return f"<Product {self.sku} - {self.title}>"


class Inventory(Base):
    __tablename__ = "inventory"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    reserved: Mapped[int] = mapped_column(default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped[Product] = relationship(back_populates="inventory")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_quantity_non_negative"),
        CheckConstraint("reserved >= 0", name="ck_inventory_reserved_non_negative"),
    )

    def available(self) -> int:
        """Stock disponible real (excluye reservado)."""
        return max(self.quantity - self.reserved, 0)

    def __repr__(self) -> str:
        return f"<Inventory pid={self.product_id} qty={self.quantity} reserved={self.reserved}>"