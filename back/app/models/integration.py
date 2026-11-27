import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base

class PlatformType(str, enum.Enum):
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    MERCADO_LIBRE = "mercado_libre"
    METHA = "metha"

class PlatformIntegration(Base):
    __tablename__ = "platform_integrations"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    platform: Mapped[PlatformType] = mapped_column(Enum(PlatformType), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    credential_1: Mapped[str | None] = mapped_column(Text, nullable=True)  # App ID / Client ID / API Key
    credential_2: Mapped[str | None] = mapped_column(Text, nullable=True)  # App Secret / Client Secret / Secret Key
    credential_3: Mapped[str | None] = mapped_column(Text, nullable=True)  # Access Token
    credential_4: Mapped[str | None] = mapped_column(Text, nullable=True)  # Account ID / extra
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
