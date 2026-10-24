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
    DATABASE_URL: str = ""
    POSTGRES_USER: str = "alpaca"
    POSTGRES_PASSWORD: str = "alpaca_dev_pass"
    POSTGRES_DB: str = "alpacachino"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    # Latido contra la base para que Supabase no cierre la sesión ociosa.
    # 0 lo desactiva (lo usan las pruebas).
    DB_KEEPALIVE_SECONDS: int = 5

    # ── Supabase (API, no la base de datos) ──
    # La base se conecta con DATABASE_URL; estas claves son para la API
    # (PostgREST/Auth/Storage) y para el cliente del frontend.
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_JWKS_URL: str = ""

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
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = False
    MAIL_FROM: str = "ventas@alpacachino.com"

    # ── Negocio ──────────────────────────────────────────────
    STOCK_RESERVATION_MINUTES: int = 15
    SHIPPING_COST: int = 3500
    FREE_SHIPPING_FROM: int = 30000
    CURRENCY: str = "CLP"
    TERMS_VERSION: str = "2026-10"
    SELLER_NAME: str = "AlpacachinoStore"
    SELLER_EMAIL: str = "ventas@alpacachino.com"
    SELLER_PHONE: str = ""
    # Datos para el pago manual por transferencia (PAYMENT_PROVIDER=manual).
    BANK_NAME: str = ""
    BANK_ACCOUNT_TYPE: str = "Cuenta corriente"
    BANK_ACCOUNT_NUMBER: str = ""
    BANK_HOLDER: str = ""
    BANK_RUT: str = ""
    BANK_EMAIL: str = ""
    # Portadas: tamaño máximo aceptado y bucket de Supabase Storage.
    MAX_COVER_MB: int = 2
    SUPABASE_STORAGE_BUCKET: str = "product-covers"

    @property
    def database_url(self) -> str:
        # Prioridad 1: URL completa (Supabase, Render, Neon…)
        if self.DATABASE_URL:
            url = self.DATABASE_URL.strip()

            # Error típico: pegar la URL HTTPS de la API en DATABASE_URL.
            if url.startswith(("http://", "https://")):
                raise ValueError(
                    "DATABASE_URL debe ser una cadena de PostgreSQL "
                    "(postgresql://usuario:clave@host:5432/base), no la URL "
                    "HTTPS de Supabase. Esa última va en SUPABASE_URL."
                )

            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg://", 1)
            elif url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+psycopg://", 1)

            if not url.startswith("postgresql"):
                raise ValueError(
                    "DATABASE_URL inválida: debe empezar con postgresql:// "
                    "o postgres://."
                )
            return url

        # Prioridad 2: variables individuales (docker-compose local)
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def manual_payment_instructions(self) -> dict:
        """Datos que el cliente necesita para transferir (pago manual)."""
        return {
            "provider": "manual",
            "bank": self.BANK_NAME,
            "account_type": self.BANK_ACCOUNT_TYPE,
            "account_number": self.BANK_ACCOUNT_NUMBER,
            "holder": self.BANK_HOLDER,
            "rut": self.BANK_RUT,
            "email": self.BANK_EMAIL or self.SELLER_EMAIL,
            "deadline_hours": 24,
            "note": (
                "Transfiere el total y envía el comprobante por correo indicando "
                "el número de pedido. El pedido queda reservado hasta el vencimiento."
            ),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
