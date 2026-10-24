"""Payment and PaymentEvent models."""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, ForeignKey, DateTime, func, Index, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.order import Order


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False)  # mercadopago | webpay
    external_id: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 0), nullable=False)
    raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order: Mapped[Order] = relationship(back_populates="payments")

    __table_args__ = (
        Index("ix_payments_provider_ext", "provider", "external_id"),
    )

    def __repr__(self) -> str:
        return f"<Payment {self.provider} {self.external_id} - {self.status}>"


class PaymentEvent(Base):
    """Idempotency table: each webhook from payment providers is stored once."""
    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_payment_event"),
    )

    def __repr__(self) -> str:
        return f"<PaymentEvent {self.provider} {self.external_id}>"