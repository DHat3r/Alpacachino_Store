"""Order and OrderItem models."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    String, Numeric, ForeignKey, Enum, DateTime, func, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.product import Product


class OrderStatus(str, enum.Enum):
    PENDING = "pending"       # creado, stock reservado
    PAID = "paid"             # pago confirmado
    FAILED = "failed"         # pago rechazado
    EXPIRED = "expired"       # reserva vencida -> stock liberado
    CANCELLED = "cancelled"   # cancelado por admin/cliente
    SHIPPED = "shipped"       # enviado físicamente
    DELIVERED = "delivered"   # entregado


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.PENDING, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 0), nullable=False)
    shipping: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 0), nullable=False)
    shipping_address: Mapped[str | None] = mapped_column(String(400), nullable=True)
    shipping_notes: Mapped[str | None] = mapped_column(String(400), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="order")

    __table_args__ = (
        Index("ix_orders_user_status", "user_id", "status"),
        CheckConstraint("total >= 0", name="ck_orders_total_positive"),
    )

    def __repr__(self) -> str:
        return f"<Order {self.id} - {self.status.value} - ${self.total}>"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 0), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(back_populates="order_items")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_qty_positive"),
        CheckConstraint("unit_price >= 0", name="ck_order_items_price_positive"),
    )

    def __repr__(self) -> str:
        return f"<OrderItem order={self.order_id} product={self.product_id} x{self.quantity}>"