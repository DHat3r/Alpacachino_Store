"""Bot conversation models for WhatsApp/Instagram."""

import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, func, Index, Enum, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.session import Base


class BotChannel(str, enum.Enum):
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"


class BotConversation(Base):
    __tablename__ = "bot_conversations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    channel: Mapped[BotChannel] = mapped_column(Enum(BotChannel), nullable=False, index=True)
    external_user_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    external_contact_id: Mapped[str | None] = mapped_column(String(80), nullable=True)  # phone_number_id / ig_user_id
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    context: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    messages: Mapped[list["BotMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        Index("ix_bot_conv_channel_user", "channel", "external_user_id"),
        Index("ix_bot_conv_status_updated", "status", "updated_at"),
    )

    def __repr__(self) -> str:
        return f"<BotConversation {self.channel.value}:{self.external_user_id}>"


class BotMessage(Base):
    __tablename__ = "bot_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("bot_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # in | out
    message_type: Mapped[str] = mapped_column(String(30), default="text", nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    external_message_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    intent: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resolved_by_bot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[BotConversation] = relationship(back_populates="messages")

    __table_args__ = (
        Index("ix_bot_msg_conv_created", "conversation_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<BotMessage {self.direction} - {self.intent or 'none'}>"