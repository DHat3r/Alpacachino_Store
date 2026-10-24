"""Motor, sesión y Base declarativa de SQLAlchemy."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

_database_url = settings.database_url

# El pooler en modo transacción de Supabase (puerto 6543) no soporta
# sentencias preparadas: psycopg las desactiva para esa URL.
_connect_args: dict[str, object] = {}
try:
    if make_url(_database_url).port == 6543:
        _connect_args["prepare_threshold"] = None
except Exception:  # URL inválida: que falle el engine con su propio mensaje
    pass

engine = create_engine(
    _database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=False,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarativa: aquí se registran todos los modelos."""


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
