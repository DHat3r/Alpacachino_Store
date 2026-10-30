"""Fixtures compartidas de la suite de pruebas.

Estrategia:
- Se usa PostgreSQL real (el mismo motor que producción) sobre una base
  dedicada ``<POSTGRES_DB>_test`` que se crea automáticamente.
- El esquema se genera con ``Base.metadata.create_all`` (no con Alembic) para
  que las pruebas sean rápidas e independientes del historial de migraciones.
- Entre pruebas se hace ``TRUNCATE ... RESTART IDENTITY CASCADE`` para aislar
  el estado sin recrear el esquema.
"""

from __future__ import annotations

import os

# Las pruebas nunca deben tocar Supabase: sin DATABASE_URL, el motor de la app
# (y Alembic) apunta al PostgreSQL local de las variables POSTGRES_*. Va antes
# de importar app.*, que lee la configuración al importarse.
os.environ["DATABASE_URL"] = ""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403  (registra todas las tablas)
from app.models.product import Category, Inventory, Product
from app.models.user import User, UserRole
from app.core.security import hash_password

# Las pruebas no deben consultar la base de desarrollo con el latido de stock.
settings.DB_KEEPALIVE_SECONDS = 0


TEST_DB = os.getenv("TEST_POSTGRES_DB", f"{settings.POSTGRES_DB}_test")


def _build_url(db_name: str) -> str:
    return (
        f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{db_name}"
    )


@pytest.fixture(scope="session", autouse=True)
def _create_test_database() -> None:
    """Crea la base de pruebas si no existe."""
    admin = create_engine(_build_url("postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_DB}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(_build_url(TEST_DB), pool_pre_ping=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture(scope="session")
def TestingSessionLocal(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _clean_tables(engine):
    """Vacía todas las tablas antes de cada prueba."""
    table_names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    """Evita que el rate limiter interfiera con las pruebas."""
    original = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original


@pytest.fixture
def db(TestingSessionLocal) -> Session:
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(TestingSessionLocal) -> TestClient:
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ────────────────────────── Factorías ──────────────────────────


@pytest.fixture
def user_factory(db):
    def _create(
        email: str = "cliente@test.cl",
        username: str = "cliente",
        password: str = "Clave1234",
        role: UserRole = UserRole.CUSTOMER,
    ) -> User:
        user = User(
            email=email,
            username=username,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return _create


@pytest.fixture
def admin_user(user_factory) -> User:
    return user_factory(email="admin@test.cl", username="admin", role=UserRole.ADMIN)


@pytest.fixture
def customer(user_factory) -> User:
    return user_factory()


@pytest.fixture
def moderator_user(user_factory) -> User:
    return user_factory(email="mod@test.cl", username="moderador", role=UserRole.MODERATOR)


@pytest.fixture
def auth_headers(client, customer) -> dict[str, str]:
    res = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def admin_headers(client, admin_user) -> dict[str, str]:
    res = client.post(
        "/api/auth/login",
        data={"username": admin_user.email, "password": "Clave1234"},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def moderator_headers(client, moderator_user) -> dict[str, str]:
    res = client.post(
        "/api/auth/login",
        data={"username": moderator_user.email, "password": "Clave1234"},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def product_factory(db):
    def _create(
        sku: str = "MANGA-001",
        title: str = "One Piece Vol. 1",
        price: int = 8990,
        stock: int = 10,
        reserved: int = 0,
        category: Category | None = None,
        is_active: bool = True,
    ) -> Product:
        if category is None:
            category = db.query(Category).filter(Category.slug == "manga").first()
            if category is None:
                category = Category(name="Manga", slug="manga")
                db.add(category)
                db.flush()

        product = Product(
            sku=sku,
            title=title,
            author="Autor de prueba",
            price=price,
            category_id=category.id,
            is_active=is_active,
        )
        db.add(product)
        db.flush()
        db.add(Inventory(product_id=product.id, quantity=stock, reserved=reserved))
        db.commit()
        db.refresh(product)
        return product

    return _create
