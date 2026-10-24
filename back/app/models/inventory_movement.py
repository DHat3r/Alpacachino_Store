"""InventoryMovement model for audit trail."""

from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func, Enum, Index, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.db.session import Base


class MovementReason(str, enum.Enum):
    SALE = "sale"
    RESERVATION = "reservation"
    RESTOCK = "restock"
    ADJUSTMENT = "adjustment"
    IMPORT = "import"
    RESERVATION_RELEASED = "reservation_released"
    SALE_CONFIRMED = "sale_confirmed"


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delta: Mapped[int] = mapped_column(nullable=False)
    reason: Mapped[MovementReason] = mapped_column(Enum(MovementReason), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_inv_mov_product_created", "product_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<InventoryMovement {self.product_id} {self.reason.value} {self.delta:+d}>"