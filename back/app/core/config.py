"""Configuración tipada leída desde el entorno (.env)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Aplicación ───────────────────────────────────────────
    APP_NAME: str = "AlpacachinoStore"
    ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = Field(min_length=32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173"
    PUBLIC_SITE_URL: str = "http://localhost:5173"
    PUBLIC_API_URL: str = "http://localhost:8000"

    # ── Base de datos ────────────────────────────────────────
    POSTGRES_USER: str = "alpaca"
    POSTGRES_PASSWORD: str = "alpaca_dev_pass"
    POSTGRES_DB: str = "alpacachino"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    # ── Redis / Celery ───────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── Pagos ────────────────────────────────────────────────
    PAYMENT_PROVIDER: str = "mercadopago"
    MP_ACCESS_TOKEN: str = ""
    MP_WEBHOOK_SECRET: str = ""
    WEBPAY_COMMERCE_CODE: str = ""
    WEBPAY_API_KEY: str = ""
    WEBPAY_ENV: str = "integration"

    # ── Bots ─────────────────────────────────────────────────
    WHATSAPP_VERIFY_TOKEN: str = ""
    WHATSAPP_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    INSTAGRAM_VERIFY_TOKEN: str = ""
    INSTAGRAM_ACCESS_TOKEN: str = ""

    # ── Correo ───────────────────────────────────────────────
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    MAIL_FROM: str = "ventas@alpacachino.com"

    # ── Negocio ──────────────────────────────────────────────
    STOCK_RESERVATION_MINUTES: int = 15

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
