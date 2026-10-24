# AlpacachinoStore — Guía paso a paso con Python + React en contenedores Docker

> Documento técnico derivado del **Acta de Constitución del Proyecto AlpacachinoStore**.
> Objetivo: llevar el acta a una implementación real, reproducible y contenerizada, cubriendo los
> requisitos funcionales (RF-01 … RF-11), los no funcionales (RNF-01 … RNF-08), los objetivos
> específicos (O1 … O6) y los riesgos (R01 … R05).

---

## Índice

1. [Decisiones de arquitectura](#1-decisiones-de-arquitectura)
2. [Requisitos previos (Paso 0)](#2-requisitos-previos-paso-0)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Paso 1 — Repositorio, Git y variables de entorno](#paso-1--repositorio-git-y-variables-de-entorno)
5. [Paso 2 — Docker Compose base (db, redis, api, web)](#paso-2--docker-compose-base)
6. [Paso 3 — Backend FastAPI: núcleo y conexión a PostgreSQL](#paso-3--backend-fastapi-núcleo-y-conexión-a-postgresql)
7. [Paso 4 — Modelo de datos y migraciones (Alembic)](#paso-4--modelo-de-datos-y-migraciones-alembic)
8. [Paso 5 — Autenticación y roles (RF-08, RNF-02)](#paso-5--autenticación-y-roles)
9. [Paso 6 — Catálogo: CRUD, búsqueda y filtros (RF-01, RF-02, O2)](#paso-6--catálogo)
10. [Paso 7 — Carrito y checkout con inventario consistente (RF-03, RF-06, RNF-04, R05)](#paso-7--carrito-y-checkout)
11. [Paso 8 — Pagos en línea: MercadoPago / Webpay (RF-04, R03)](#paso-8--pagos-en-línea)
12. [Paso 9 — Panel administrativo (RF-05, O3)](#paso-9--panel-administrativo)
13. [Paso 10 — Foro comunitario (RF-08, RF-09, RF-10, O6)](#paso-10--foro-comunitario)
14. [Paso 11 — Importación del catálogo desde Excel (RF-07, O4)](#paso-11--importación-del-catálogo-desde-excel)
15. [Paso 12 — Bots de WhatsApp e Instagram (RF-11, O5, R02)](#paso-12--bots-de-whatsapp-e-instagram)
16. [Paso 13 — Frontend React con Vite](#paso-13--frontend-react-con-vite)
17. [Paso 14 — Dockerfiles de producción y Nginx](#paso-14--dockerfiles-de-producción-y-nginx)
18. [Paso 15 — Pruebas automatizadas](#paso-15--pruebas-automatizadas)
19. [Paso 16 — CI/CD con GitHub Actions](#paso-16--cicd-con-github-actions)
20. [Paso 17 — Despliegue del PMV (Vercel, Render, Supabase)](#paso-17--despliegue-del-pmv)
21. [Paso 18 — Seguridad, respaldo y cumplimiento legal](#paso-18--seguridad-respaldo-y-cumplimiento-legal)
22. [Paso 19 — Observabilidad y límites del Free Tier (R04)](#paso-19--observabilidad-y-límites-del-free-tier)
23. [Cronograma: acta vs. pasos técnicos](#cronograma-acta-vs-pasos-técnicos)
24. [Checklist de aceptación del PMV](#checklist-de-aceptación-del-pmv)
25. [Anexos: comandos, errores frecuentes](#anexos)

---

## 1. Decisiones de arquitectura

### 1.1 Stack elegido

| Capa | Tecnología | Justificación en el acta |
|---|---|---|
| Backend / API | **Python 3.12 + FastAPI + Pydantic v2** | Tipado, OpenAPI automático, rápido de desarrollar con 4 personas |
| ORM / migraciones | **SQLAlchemy 2.0 + Alembic** | Control de esquema versionado (RNF-08) |
| Base de datos | **PostgreSQL 16** (local en Docker) → **Supabase** (nube) | O4 exige PostgreSQL en Supabase |
| Caché / colas | **Redis 7** | Carrito, rate limiting, colas de bots y tareas |
| Tareas asíncronas | **Celery + Celery Beat** | Liberar stock reservado, enviar correos, procesar webhooks |
| Frontend | **React 18 + TypeScript + Vite + Tailwind + TanStack Query** | SPA responsive (RNF-01), desplegable en Vercel |
| App móvil | **React Native (Expo)** — fase posterior | Fuera de alcance el código nativo |
| Pagos | **MercadoPago Checkout Pro** + **Transbank Webpay Plus** (sandbox) | RF-04 |
| Bots | **WhatsApp Cloud API + Instagram Messaging API** (webhooks) | RF-11 |
| Contenedores | **Docker + Docker Compose** | Entorno único para los 4 integrantes |
| CI/CD | **GitHub Actions** | RNF-08 |
| Proxy / TLS | **Nginx** (contenedor web) + TLS en el proveedor | RNF-03 |

### 1.2 Diagrama de contenedores

```
                    ┌──────────────────────────────────────────────┐
   Navegador  ─────►│  web (Nginx)  :80 / :443                     │
                    │  · sirve el build de React (SPA)             │
                    │  · proxy /api → api:8000                     │
                    └───────────────┬──────────────────────────────┘
                                    │ red interna "alpacachino_net"
                    ┌───────────────▼──────────────┐
                    │  api (FastAPI + Uvicorn)     │
                    └───┬───────────┬──────────┬───┘
                        │           │          │
              ┌─────────▼──┐  ┌─────▼────┐  ┌──▼──────────┐
              │ db Postgres│  │ redis    │  │ worker      │
              │  :5432     │  │ :6379    │  │ Celery      │
              └────────────┘  └──────────┘  │ beat        │
                                            └─────────────┘
   Meta (WhatsApp/Instagram) ──webhook──► api /api/webhooks/*
   MercadoPago / Webpay ─────webhook──► api /api/payments/webhook
```

### 1.3 Conceptos de Docker que se usan en esta guía

- **Imagen**: plantilla inmutable (ej. `python:3.12-slim`).
- **Contenedor**: instancia en ejecución de una imagen.
- **Dockerfile**: receta para construir la imagen de *tu* aplicación.
- **Docker Compose**: orquesta varios contenedores como un solo sistema.
- **Volumen**: persistencia de datos (la BD no se pierde al bajar contenedores).
- **Red**: los servicios se ven por nombre (`db`, `redis`, `api`), no por `localhost`.
- **`depends_on` + `healthcheck`**: evitar que la API arranque antes que Postgres.

> Regla de oro: **dentro de un contenedor, `localhost` es el propio contenedor.** Por eso
> `DATABASE_URL` apunta a `db`, no a `127.0.0.1`.

---

## 2. Requisitos previos (Paso 0)

### 2.1 Software a instalar

| Herramienta | Versión mínima | Verificación |
|---|---|---|
| Docker Desktop (WSL2 en Windows) | 4.x | `docker --version` |
| Docker Compose (plugin v2) | 2.20 | `docker compose version` |
| Git | 2.40 | `git --version` |
| Node.js (solo para tooling local; no obligatorio) | 20 LTS | `node -v` |
| Python (solo para scripts locales; no obligatorio) | 3.12 | `python --version` |
| VS Code + extensión Docker | — | — |
| Cuenta GitHub | — | — |
| Cuenta MercadoPago Developers / Transbank | — | sandbox |

> En Windows: activar **"Use the WSL 2 based engine"** en Docker Desktop y mantener el proyecto
> dentro del disco `F:` (no en una carpeta sincronizada de OneDrive, para evitar bloqueos de
> archivos).

### 2.2 Verificación rápida

```powershell
docker run --rm hello-world
docker compose version
git --version
```

Si `hello-world` no imprime el mensaje, detente aquí: el resto de la guía no funcionará.

### 2.3 Cuentas externas a crear (bloqueante para O1)

1. Dominio `alpacachino.com` apuntando al proveedor de hosting.
2. Correos `contacto@`, `ventas@`, `soporte@` (plan gratuito tipo Zoho Mail / Cloudflare Email Routing).
3. Repositorio GitHub `alpacachino-store` (privado).
4. Proyecto Supabase (región `sa-east-1` o `us-east-1`, la más cercana disponible).
5. App en Meta for Developers con los productos **WhatsApp** e **Instagram Messaging**.
6. Aplicación en MercadoPago Developers (credenciales *test*) y/o Transbank sandbox.

---

## 3. Estructura del repositorio

```
alpacachino-store/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .env                      # NO se versiona
├── .gitignore
├── Makefile
├── README.md
├── docs/
│   ├── arquitectura.md
│   ├── api.md
│   └── manual-despliegue.md
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/          # config, security, logging
│   │   ├── db/            # session, base
│   │   ├── models/        # SQLAlchemy
│   │   ├── schemas/       # Pydantic
│   │   ├── api/
│   │   │   ├── deps.py
│   │   │   └── routes/    # auth, products, cart, orders, payments,
│   │   │                  # admin, forum, webhooks, health
│   │   ├── services/      # inventory, payments, bots, mail
│   │   └── worker.py      # celery app + tareas
│   ├── scripts/
│   │   └── import_catalog.py
│   └── tests/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/           # cliente HTTP
│       ├── pages/         # Home, Catalog, Product, Cart, Checkout,
│       │                  # Login, Register, Forum, Post
│       ├── admin/         # Dashboard, Products, Orders, Forum
│       ├── components/
│       └── store/         # carrito (Zustand)
└── data/
    └── catalogo.xlsx      # archivo del propietario (NO versionar)
```

Crea la estructura con:

```bash
mkdir -p backend/app/{core,db,models,schemas,api/routes,services} \
         backend/{scripts,tests} backend/alembic/versions \
         frontend/src/{api,pages,admin,components,store} \
         docs data
```

---

## Paso 1 — Repositorio, Git y variables de entorno

### 1.1 Inicializar Git

```bash
git init
git branch -M main
```

`.gitignore`:

```gitignore
# Entornos y secretos
.env
.env.*
!.env.example

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Node
node_modules/
dist/
.vite/

# Datos y artefactos
data/*.xlsx
data/*.csv
*.sqlite3
*.log
pgdata/
```

### 1.2 `.env.example` (contrato de configuración)

```dotenv
# ── Aplicación ────────────────────────────────────────────
APP_NAME=AlpacachinoStore
ENV=development                  # development | production
DEBUG=true
SECRET_KEY=cambia-esto-por-una-cadena-aleatoria-de-64-chars
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
BACKEND_CORS_ORIGINS=http://localhost:5173,http://localhost:8080
PUBLIC_SITE_URL=http://localhost:8080

# ── Base de datos ─────────────────────────────────────────
POSTGRES_USER=alpaca
POSTGRES_PASSWORD=alpaca_dev_pass
POSTGRES_DB=alpacachino
POSTGRES_HOST=db
POSTGRES_PORT=5432

# ── Redis / Celery ────────────────────────────────────────
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# ── Pagos ─────────────────────────────────────────────────
MP_ACCESS_TOKEN=TEST-0000000000000000-000000-xxxxxxxx
MP_PUBLIC_KEY=TEST-xxxxxxxx
MP_WEBHOOK_SECRET=xxxxxxxx
WEBPAY_COMMERCE_CODE=597055555532
WEBPAY_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
WEBPAY_ENV=integration

# ── Bots Meta ─────────────────────────────────────────────
WHATSAPP_VERIFY_TOKEN=alpacachino-verify
WHATSAPP_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890
INSTAGRAM_VERIFY_TOKEN=alpacachino-ig-verify
INSTAGRAM_ACCESS_TOKEN=EAAG...
INSTAGRAM_ACCOUNT_ID=17841400000000000

# ── Correo ────────────────────────────────────────────────
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=ventas@alpacachino.com

# ── Reserva de stock ──────────────────────────────────────
STOCK_RESERVATION_MINUTES=15
```

> **Seguridad**: `SECRET_KEY` y tokens **nunca** se suben al repo. En producción se cargan como
> variables de entorno del proveedor (Render) o `Settings → Environment`.

Generar una clave:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copia el archivo:

```powershell
Copy-Item .env.example .env
```

---

## Paso 2 — Docker Compose base

Crea `docker-compose.yml` en la raíz. Incluye perfiles para no levantar todo siempre.

```yaml
name: alpacachino

services:
  # ─────────────────────────── Base de datos ───────────────────────────
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"                 # solo para inspección local
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 12
    networks: [alpacachino_net]

  # ─────────────────────────── Caché / colas ──────────────────────────
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks: [alpacachino_net]

  # ─────────────────────────── API (FastAPI) ──────────────────────────
  api:
    build:
      context: ./backend
      target: development
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_HOST: db
      REDIS_URL: redis://redis:6379/0
    volumes:
      - ./backend:/app                 # hot reload en desarrollo
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    command: >
      sh -c "alembic upgrade head &&
             uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
    networks: [alpacachino_net]

  # ─────────────────────── Worker Celery (tareas) ─────────────────────
  worker:
    build:
      context: ./backend
      target: development
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_HOST: db
    volumes:
      - ./backend:/app
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    command: celery -A app.worker.celery_app worker -l info --concurrency=2
    networks: [alpacachino_net]

  # ─────────────────── Beat (tareas programadas) ──────────────────────
  beat:
    build:
      context: ./backend
      target: development
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_HOST: db
    volumes:
      - ./backend:/app
    depends_on:
      redis:
        condition: service_started
    command: celery -A app.worker.celery_app beat -l info
    networks: [alpacachino_net]

  # ────────────────────── Frontend dev (Vite) ─────────────────────────
  web:
    image: node:22-alpine
    working_dir: /app
    restart: unless-stopped
    environment:
      VITE_API_URL: http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    depends_on:
      - api
    networks: [alpacachino_net]

  # ────────────────────── Herramientas de apoyo ───────────────────────
  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "8025:8025"     # UI web
      - "1025:1025"     # SMTP
    networks: [alpacachino_net]
    profiles: [tools]

  adminer:
    image: adminer:latest
    ports:
      - "8081:8080"
    depends_on:
      - db
    networks: [alpacachino_net]
    profiles: [tools]

volumes:
  pgdata:
  redisdata:

networks:
  alpacachino_net:
    driver: bridge
```

### 2.1 Crear el Dockerfile de desarrollo del backend

`backend/Dockerfile` (todavía sin etapa de producción, la agregamos en el Paso 14):

```dockerfile
# syntax=docker/dockerfile:1

# ---------- Etapa: desarrollo ----------
FROM python:3.12-slim AS development

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`backend/requirements.txt`:

```text
fastapi==0.115.*
uvicorn[standard]==0.34.*
pydantic==2.10.*
pydantic-settings==2.7.*
SQLAlchemy==2.0.*
psycopg[binary]==3.2.*
alembic==1.14.*
python-jose[cryptography]==3.3.*
passlib[bcrypt]==1.7.*          # o pwdlib[argon2]
python-multipart==0.0.20
email-validator==2.2.*
celery[redis]==5.4.*
redis==5.2.*
httpx==0.28.*
slowapi==0.1.9
pandas==2.2.*
openpyxl==3.1.*
mercadopago==2.2.*
transbank-sdk==6.0.*
pytest==8.3.*
pytest-asyncio==0.25.*
```

### 2.2 Primer arranque

```bash
docker compose up -d --build
docker compose ps
```

Debe haber `db`, `redis`, `api`, `worker`, `beat`, `web` en estado `running`/`healthy`.
Prueba:

```bash
curl http://localhost:8000/docs          # Swagger
curl http://localhost:8000/api/health    # debe responder {"status":"ok"}
```

Con herramientas:

```bash
docker compose --profile tools up -d      # Adminer en :8081, MailHog en :8025
```

### 2.3 Comandos del día a día

```bash
docker compose logs -f api          # ver logs de la API
docker compose exec api bash        # entrar al contenedor
docker compose exec db psql -U alpaca -d alpacachino
docker compose down                 # detener (conserva datos)
docker compose down -v              # detener y BORRAR volúmenes (¡cuidado!)
docker compose up -d --build api    # reconstruir solo la API
```

Crea un `Makefile` para el equipo:

```makefile
up:      ; docker compose up -d --build
down:    ; docker compose down
logs:    ; docker compose logs -f api worker
sh:      ; docker compose exec api bash
migrate: ; docker compose exec api alembic upgrade head
revision:; docker compose exec api alembic revision --autogenerate -m "$(m)"
test:    ; docker compose exec api pytest -q
seed:    ; docker compose exec api python -m scripts.import_catalog --file /data/catalogo.xlsx
```

> En Windows sin `make`, ejecuta los comandos de la columna derecha directamente.

---

## Paso 3 — Backend FastAPI: núcleo y conexión a PostgreSQL

### 3.1 Configuración tipada

`backend/app/core/config.py`:

```python
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "AlpacachinoStore"
    ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = Field(min_length=32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173"
    PUBLIC_SITE_URL: str = "http://localhost:8080"

    POSTGRES_USER: str = "alpaca"
    POSTGRES_PASSWORD: str = "alpaca_dev_pass"
    POSTGRES_DB: str = "alpacachino"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    MP_ACCESS_TOKEN: str = ""
    MP_WEBHOOK_SECRET: str = ""
    WEBPAY_COMMERCE_CODE: str = ""
    WEBPAY_API_KEY: str = ""
    WEBPAY_ENV: str = "integration"

    WHATSAPP_VERIFY_TOKEN: str = ""
    WHATSAPP_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    INSTAGRAM_VERIFY_TOKEN: str = ""
    INSTAGRAM_ACCESS_TOKEN: str = ""

    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    MAIL_FROM: str = "ventas@alpacachino.com"

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
```

> Si usas **Supabase**, basta con definir `DATABASE_URL` completa (con `?sslmode=require`)
> y leerla desde el entorno. Ver Paso 17.

### 3.2 Sesión y Base declarativa

`backend/app/db/session.py`:

```python
from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 3.3 `main.py` con healthcheck y CORS

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.api.routes import auth, products, cart, orders, payments, admin, forum, webhooks

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth, products, cart, orders, payments, admin, forum, webhooks):
    app.include_router(router.router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "env": settings.ENV}
```

Verifica: `curl http://localhost:8000/api/health`.

---

## Paso 4 — Modelo de datos y migraciones (Alembic)

### 4.1 Entidades mínimas

| Tabla | Propósito | Requisitos |
|---|---|---|
| `users` | Cuentas (cliente, admin, moderador) | RF-08 |
| `categories` | Categorías del catálogo | RF-02 |
| `products` | Ficha del producto (SKU, título, autor, precio, imágenes) | RF-01 |
| `inventory` | Stock por producto, con `CHECK (quantity >= 0)` | RF-06, RNF-04 |
| `orders` / `order_items` | Pedido y detalle con precio congelado | RF-03, RF-05 |
| `payments` | Transacción con la pasarela | RF-04 |
| `payment_events` | Webhooks recibidos (idempotencia) | RF-04 |
| `forum_posts` / `forum_comments` | Publicaciones, reseñas, comentarios | RF-09 |
| `forum_reports` | Denuncias para moderación | RF-10 |
| `bot_conversations` / `bot_messages` | Estado de cada chat | RF-11 |

### 4.2 Ejemplo de modelos clave

`backend/app/models/product.py`:

```python
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    String, Text, Numeric, ForeignKey, DateTime, CheckConstraint, Index, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    author: Mapped[str | None] = mapped_column(String(120))
    publisher: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 0))          # CLP sin decimales
    cover_url: Mapped[str | None] = mapped_column(String(500))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    category: Mapped[Category | None] = relationship(back_populates="products")
    inventory: Mapped["Inventory"] = relationship(back_populates="product", uselist=False)

    __table_args__ = (
        Index("ix_products_search", "title", "author"),
        CheckConstraint("price >= 0", name="ck_products_price_positive"),
    )


class Inventory(Base):
    __tablename__ = "inventory"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    quantity: Mapped[int] = mapped_column(default=0)
    reserved: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped[Product] = relationship(back_populates="inventory")

    # Blindaje a nivel de BD: nunca stock negativo (R05 / RNF-04)
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_quantity_non_negative"),
        CheckConstraint("reserved >= 0", name="ck_inventory_reserved_non_negative"),
    )
```

`backend/app/models/order.py` (resumen):

```python
import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, ForeignKey, Enum, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class OrderStatus(str, enum.Enum):
    PENDING = "pending"              # creado, stock reservado
    PAID = "paid"
    FAILED = "failed"
    EXPIRED = "expired"              # reserva vencida → stock liberado
    CANCELLED = "cancelled"
    SHIPPED = "shipped"
    DELIVERED = "delivered"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.PENDING)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 0))
    shipping: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 0))
    shipping_address: Mapped[str | None] = mapped_column(String(400))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column()
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 0))   # precio congelado

    order: Mapped[Order] = relationship(back_populates="items")
```

`backend/app/models/payment.py` (idempotencia, clave contra doble cobro):

```python
class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    provider: Mapped[str] = mapped_column(String(30))        # mercadopago | webpay
    external_id: Mapped[str | None] = mapped_column(String(120), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 0))
    raw_response: Mapped[dict | None] = mapped_column(JSONB)


class PaymentEvent(Base):
    """Un webhook repetido no debe procesarse dos veces (riesgo R03)."""
    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(30))
    external_id: Mapped[str] = mapped_column(String(120))
    payload: Mapped[dict] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_payment_event"),
    )
```

### 4.3 Alembic

`backend/alembic.ini` → deja `sqlalchemy.url` vacío (se inyecta desde el entorno).

`backend/alembic/env.py`:

```python
from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.session import Base
import app.models  # noqa: F401  ← importa TODOS los modelos

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
```

`backend/app/models/__init__.py`:

```python
from app.models.user import User, UserRole
from app.models.product import Product, Category, Inventory
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentEvent
from app.models.forum import ForumPost, ForumComment, ForumReport
from app.models.bot import BotConversation, BotMessage

__all__ = [...]
```

Generar y aplicar la primera migración:

```bash
docker compose exec api alembic revision --autogenerate -m "esquema inicial"
docker compose exec api alembic upgrade head
```

Verificar en la BD:

```bash
docker compose exec db psql -U alpaca -d alpacachino -c "\dt"
```

> **Buen hábito**: revisar siempre el archivo generado en `alembic/versions/` antes de aplicarlo.
> Autogenerate no detecta renombres ni cambios de tipo complejos.

---

## Paso 5 — Autenticación y roles

Cubre **RF-08** (registro y autenticación) y **RNF-02** (hash seguro).

### 5.1 Hash y tokens

`backend/app/core/security.py`:

```python
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(subject: str, role: str, kind: str = "access") -> str:
    minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES if kind == "access" else settings.REFRESH_TOKEN_EXPIRE_DAYS * 1440
    payload = {
        "sub": subject,
        "role": role,
        "type": kind,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Token inválido o expirado") from exc
```

> `bcrypt` trunca a 72 bytes y es la opción estándar. Si prefieres `argon2`, cambia a
> `CryptContext(schemes=["argon2"])` — más moderno, mismo uso.

### 5.2 Roles y dependencias

`backend/app/models/user.py`:

```python
import enum
from sqlalchemy import String, Enum, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    MODERATOR = "moderator"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CUSTOMER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

`backend/app/api/deps.py`:

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError
        user_id = int(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")
    return user


def require_roles(*roles: UserRole):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permiso denegado")
        return user
    return checker


require_admin = require_roles(UserRole.ADMIN)
require_moderator = require_roles(UserRole.ADMIN, UserRole.MODERATOR)
```

### 5.3 Rutas de auth con rate limiting

`backend/app/api/routes/auth.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "El correo ya está registrado")
    user = User(
        email=payload.email.lower(),
        username=payload.username,
        hashed_password=hash_password(payload.password),   # RNF-02
        role=UserRole.CUSTOMER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")
    return TokenPair(
        access_token=create_token(str(user.id), user.role.value, "access"),
        refresh_token=create_token(str(user.id), user.role.value, "refresh"),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
```

Reglas de contraseña en `schemas/user.py` con `constr(min_length=8)` + validación de
mayúscula/número, y **nunca** devolver `hashed_password` en la respuesta.

Probar:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@alpacachino.com","username":"tester","password":"Alpaca2026"}'

curl -X POST http://localhost:8000/api/auth/login \
  -d "username=test@alpacachino.com&password=Alpaca2026"
```

---

## Paso 6 — Catálogo

Cubre **RF-01** (CRUD), **RF-02** (búsqueda y filtros) y **O2**.

### 6.1 Listado público con filtros y paginación

`backend/app/api/routes/products.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.product import Product, Category, Inventory
from app.schemas.product import ProductOut, ProductPage, ProductCreate

router = APIRouter(tags=["catalog"])


@router.get("/products", response_model=ProductPage)
def list_products(
    q: str | None = Query(None, max_length=80),
    category: str | None = None,
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    in_stock: bool = False,
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=48),
    db: Session = Depends(get_db),
):
    stmt = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.is_active.is_(True))
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.filter(or_(Product.title.ilike(like), Product.author.ilike(like)))
    if category:
        stmt = stmt.join(Category).filter(Category.slug == category)
    if min_price is not None:
        stmt = stmt.filter(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.filter(Product.price <= max_price)
    if in_stock:
        stmt = stmt.join(Inventory).filter(Inventory.quantity > 0)

    total = stmt.count()
    items = stmt.order_by(Product.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": items, "total": total, "page": page, "size": size}


@router.get("/products/{slug_or_id}", response_model=ProductOut)
def get_product(slug_or_id: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.sku == slug_or_id).first()
    if not product:
        from fastapi import HTTPException
        raise HTTPException(404, "Producto no encontrado")
    return product


@router.post("/admin/products", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    product = Product(**payload.model_dump(exclude={"stock"}))
    db.add(product)
    db.flush()
    db.add(Inventory(product_id=product.id, quantity=payload.stock))
    db.commit()
    db.refresh(product)
    return product
```

Rutas de administración equivalentes para `PUT /admin/products/{id}` y
`DELETE /admin/products/{id}` (borrado lógico: `is_active = False`), cubriendo **RF-01** completo.

### 6.2 Rendimiento (RNF-06)

- Índices en `title`, `author`, `category_id`, `sku` (ya definidos).
- `joinedload` para evitar el problema N+1.
- Paginación obligatoria (máx. 48 ítems).
- Imágenes servidas por CDN y comprimidas a WebP (mitiga **R04**).
- Para búsqueda difusa avanzada en el futuro: `pg_trgm` + índice GIN.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ix_products_title_trgm ON products USING gin (title gin_trgm_ops);
```

---

## Paso 7 — Carrito y checkout

Cubre **RF-03**, **RF-06**, **RNF-04** y el riesgo **R05** (el más severo del acta).

### 7.1 Estrategia de carrito

El carrito es **del lado del cliente** (Zustand + `localStorage`) y se valida contra el servidor
solo al hacer checkout. Esto evita inconsistencias y simplifica el backend.

### 7.2 Servicio de inventario: el corazón de R05

**Nunca** hagas `product.stock -= qty` en Python. Usa un `UPDATE` condicional atómico:

`backend/app/services/inventory.py`:

```python
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


def reserve_stock(db: Session, product_id: int, qty: int) -> None:
    """
    Descuenta stock de forma atómica. Si otra transacción ya lo tomó,
    rowcount == 0 y se aborta el checkout completo.
    """
    result = db.execute(
        text("""
            UPDATE inventory
               SET quantity = quantity - :qty,
                   reserved = reserved + :qty,
                   updated_at = now()
             WHERE product_id = :pid
               AND quantity >= :qty
        """),
        {"qty": qty, "pid": product_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Stock insuficiente para uno de los productos del carrito",
        )


def confirm_reservation(db: Session, product_id: int, qty: int) -> None:
    """Al confirmarse el pago, la reserva se descuenta definitivamente."""
    db.execute(
        text("UPDATE inventory SET reserved = GREATEST(reserved - :qty, 0) WHERE product_id = :pid"),
        {"qty": qty, "pid": product_id},
    )


def release_stock(db: Session, product_id: int, qty: int) -> None:
    """Si el pago falla o expira, se devuelve el stock."""
    db.execute(
        text("""
            UPDATE inventory
               SET quantity = quantity + :qty,
                   reserved = GREATEST(reserved - :qty, 0),
                   updated_at = now()
             WHERE product_id = :pid
        """),
        {"qty": qty, "pid": product_id},
    )


def next_expiration() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.STOCK_RESERVATION_MINUTES)
```

**Por qué funciona**: `UPDATE ... WHERE quantity >= :qty` se evalúa bajo el lock de fila de
PostgreSQL. Dos compradores simultáneos del último ejemplar → uno obtiene `rowcount = 1` y el
otro `rowcount = 0`. Además el `CHECK (quantity >= 0)` es la última barrera.

### 7.3 Endpoint de checkout

`backend/app/api/routes/orders.py`:

```python
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.order import CheckoutRequest, OrderOut
from app.services import inventory
from app.services.payments.factory import create_payment_preference

router = APIRouter(tags=["orders"])


@router.post("/orders/checkout", response_model=OrderOut, status_code=201)
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(422, "El carrito está vacío")

    try:
        # ── 1. Validar productos y precios en el servidor (nunca confiar en el cliente)
        products: dict[int, Product] = {}
        for item in payload.items:
            product = db.get(Product, item.product_id)
            if not product or not product.is_active:
                raise HTTPException(404, f"Producto {item.product_id} no disponible")
            products[item.product_id] = product
            # ── 2. Reservar stock (atómico)
            inventory.reserve_stock(db, item.product_id, item.quantity)

        # ── 3. Calcular totales con precios de la BD
        subtotal = sum(
            (products[i.product_id].price * i.quantity for i in payload.items),
            Decimal(0),
        )
        shipping = Decimal(0) if subtotal >= 30000 else Decimal(3500)

        order = Order(
            user_id=user.id,
            status=OrderStatus.PENDING,
            subtotal=subtotal,
            shipping=shipping,
            total=subtotal + shipping,
            shipping_address=payload.shipping_address,
            expires_at=inventory.next_expiration(),
        )
        db.add(order)
        db.flush()

        for item in payload.items:
            db.add(OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=products[item.product_id].price,
            ))

        db.commit()   # ← todo o nada: si algo falló antes, no se reservó nada
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    # ── 4. Crear preferencia de pago fuera de la transacción
    preference = create_payment_preference(order)
    return {"order": order, "payment_url": preference["init_point"]}
```

**Puntos críticos a remarcar en la defensa del proyecto**:

1. Los precios se leen de la BD, no del carrito del cliente.
2. `db.commit()` único → atomicidad total.
3. La reserva caduca (`expires_at`) y un job de Celery la libera (ver Paso 7.4).

### 7.4 Tarea programada que libera reservas vencidas

`backend/app/worker.py`:

```python
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "alpacachino",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Santiago",
    beat_schedule={
        "expirar-reservas": {
            "task": "app.tasks.expire_reservations",
            "schedule": 60.0,                      # cada minuto
        },
        "reporte-diario": {
            "task": "app.tasks.daily_report",
            "schedule": crontab(hour=8, minute=0),
        },
    },
)
```

`backend/app/tasks.py`:

```python
from datetime import datetime, timezone
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.order import Order, OrderStatus
from app.services import inventory
from app.worker import celery_app


@celery_app.task(name="app.tasks.expire_reservations")
def expire_reservations() -> int:
    db = SessionLocal()
    try:
        expired = db.scalars(
            select(Order).where(
                Order.status == OrderStatus.PENDING,
                Order.expires_at < datetime.now(timezone.utc),
            )
        ).all()
        for order in expired:
            for item in order.items:
                inventory.release_stock(db, item.product_id, item.quantity)
            order.status = OrderStatus.EXPIRED
        db.commit()
        return len(expired)
    finally:
        db.close()
```

---

## Paso 8 — Pagos en línea

Cubre **RF-04** y el riesgo **R03** (fallo de integración).

### 8.1 Patrón *Strategy* para no acoplar la pasarela

`backend/app/services/payments/factory.py`:

```python
from app.core.config import settings
from app.services.payments import mercadopago, webpay


def create_payment_preference(order) -> dict:
    provider = settings.PAYMENT_PROVIDER  # "mercadopago" | "webpay"
    if provider == "webpay":
        return webpay.create_transaction(order)
    return mercadopago.create_preference(order)
```

Ventaja: si Webpay falla o cambia, el resto del sistema no se toca. Es la mitigación de R03.

### 8.2 MercadoPago Checkout Pro

```python
import mercadopago
from app.core.config import settings

sdk = mercadopago.SDK(settings.MP_ACCESS_TOKEN)


def create_preference(order) -> dict:
    preference = {
        "items": [
            {
                "title": f"Pedido #{order.id}",
                "quantity": 1,
                "unit_price": float(order.total),
                "currency_id": "CLP",
            }
        ],
        "external_reference": str(order.id),
        "notification_url": f"{settings.PUBLIC_API_URL}/api/payments/webhook/mercadopago",
        "back_urls": {
            "success": f"{settings.PUBLIC_SITE_URL}/checkout/exito",
            "failure": f"{settings.PUBLIC_SITE_URL}/checkout/error",
            "pending": f"{settings.PUBLIC_SITE_URL}/checkout/pendiente",
        },
        "auto_return": "approved",
    }
    result = sdk.preference().create(preference)
    data = result["response"]
    return {"init_point": data["init_point"], "external_id": data["id"]}
```

### 8.3 Webhook idempotente (evita doble descuento de stock)

`backend/app/api/routes/payments.py`:

```python
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentEvent
from app.services import inventory
from app.services.payments import mercadopago

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/webhook/mercadopago", status_code=200)
async def mercadopago_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()

    # 1. Registrar el evento; si ya existe, salir sin reprocesar
    event = PaymentEvent(
        provider="mercadopago",
        external_id=str(body.get("data", {}).get("id", body.get("id"))),
        payload=body,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicado-ignorado"}

    # 2. Consultar el estado REAL a la pasarela (no confiar en el body)
    payment_id = body["data"]["id"]
    payment_info = mercadopago.get_payment(payment_id)
    if payment_info["status"] != "approved":
        return {"status": "no-aprobado"}

    order_id = int(payment_info["external_reference"])
    order = db.get(Order, order_id)
    if order is None or order.status == OrderStatus.PAID:
        return {"status": "ignorado"}

    # 3. Confirmar pedido y consolidar reserva
    for item in order.items:
        inventory.confirm_reservation(db, item.product_id, item.quantity)

    order.status = OrderStatus.PAID
    db.add(Payment(
        order_id=order.id,
        provider="mercadopago",
        external_id=str(payment_id),
        status="approved",
        amount=order.total,
        raw_response=payment_info,
    ))
    db.commit()

    # 4. Correo de confirmación (asíncrono)
    from app.tasks import send_order_confirmation
    send_order_confirmation.delay(order.id)

    return {"status": "ok"}
```

> **Regla de oro de webhooks**: *nunca* marques un pedido como pagado basándote solo en el
> cuerpo del POST. Siempre re-consulta el estado en la API de la pasarela. Es la diferencia
> entre un sistema seguro y uno vulnerable a fraude.

### 8.4 Webpay Plus (Transbank)

```python
from transbank.webpay.webpay_plus.transaction import Transaction
from transbank.common.integration_type import IntegrationType

tx = Transaction.build_for_integration(
    commerce_code=settings.WEBPAY_COMMERCE_CODE,
    api_key=settings.WEBPAY_API_KEY,
    integration_type=IntegrationType.TEST,
)


def create_transaction(order) -> dict:
    response = tx.create(
        buy_order=f"ORD-{order.id}",
        session_id=f"SES-{order.id}",
        amount=float(order.total),
        return_url=f"{settings.PUBLIC_API_URL}/api/payments/webhook/webpay",
    )
    return {"init_point": response["url"], "token": response["token"], "external_id": response["token"]}
```

El retorno de Webpay es un `POST` con `token_ws`; se confirma con `tx.commit(token_ws)` y se
aplica la misma lógica de idempotencia.

### 8.5 Pruebas en sandbox (mitigación formal de R03)

Checklist antes de conectar producción:

- [ ] Pago aprobado → pedido `PAID` + stock consolidado.
- [ ] Pago rechazado → pedido `FAILED` + stock liberado.
- [ ] Webhook duplicado 3 veces → un solo `Payment`, un solo descuento.
- [ ] Webhook con firma inválida → `401`.
- [ ] Abandono del checkout → reserva expira en 15 min y el stock vuelve.
- [ ] Compra concurrente del último ejemplar → segundo comprador recibe `409`.

---

## Paso 9 — Panel administrativo

Cubre **RF-05** y **O3** (que el dueño opere sin ayuda técnica).

### 9.1 Endpoints

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/admin/products?q=` | Listar con stock y estado |
| POST | `/api/admin/products` | Crear producto + inventario inicial |
| PATCH | `/api/admin/products/{id}` | Precio, título, categoría, activo |
| PATCH | `/api/admin/inventory/{id}` | Ajuste de stock con motivo |
| GET | `/api/admin/orders?status=` | Pedidos filtrados |
| PATCH | `/api/admin/orders/{id}/status` | Cambiar estado (enviado/entregado) |
| GET | `/api/admin/dashboard` | KPIs: ventas del mes, stock bajo, pedidos pendientes |
| GET | `/api/admin/forum/reports` | Contenido denunciado |

Todos con `Depends(require_admin)`.

### 9.2 Ajuste de stock auditado

Nunca sobrescribas el stock sin registro. Crea `inventory_movements`:

```python
class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    delta: Mapped[int] = mapped_column()             # +10, -2, etc.
    reason: Mapped[str] = mapped_column(String(40))  # sale | restock | adjustment | import
    reference: Mapped[str | None] = mapped_column(String(80))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

Así el dueño puede responder "¿por qué tengo 3 menos?" — algo que el Excel nunca permitió.

### 9.3 Frontend del panel

- Ruta protegida `/admin/*` con verificación de rol.
- Tabla con búsqueda, edición en línea y alertas de stock bajo (`quantity <= 3`).
- Importador visual de Excel (arrastrar archivo → previsualizar → confirmar).
- Exportación CSV de pedidos para contabilidad.

---

## Paso 10 — Foro comunitario

Cubre **RF-08**, **RF-09**, **RF-10** y **O6**.

### 10.1 Modelos

```python
class ForumPost(Base):
    __tablename__ = "forum_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))  # reseña
    rating: Mapped[int | None] = mapped_column()      # 1..5 si es reseña
    is_hidden: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_rating"),)


class ForumReport(Base):
    __tablename__ = "forum_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int | None] = mapped_column(ForeignKey("forum_posts.id", ondelete="CASCADE"))
    comment_id: Mapped[int | None] = mapped_column(ForeignKey("forum_comments.id", ondelete="CASCADE"))
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String(200))
    resolved: Mapped[bool] = mapped_column(default=False)
```

### 10.2 Reglas de moderación (RF-10)

- Moderación **blanda**: `is_hidden = True` en vez de `DELETE`, para conservar evidencia.
- Solo `admin` y `moderator` pueden ocultar; el autor puede borrar su propio post.
- Sanitizar HTML en el cliente (`DOMPurify`) y validar longitud en el servidor.
- Rate limit por usuario: máximo 5 publicaciones/hora (`slowapi`).
- Reportes: 3 denuncias → el post entra a la cola de revisión.

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


@router.post("/forum/posts", status_code=201)
@limiter.limit("5/hour")
def create_post(request: Request, payload: PostCreate, db=Depends(get_db), user=Depends(get_current_user)):
    ...
```

### 10.3 Reseñas vinculadas a compra verificada (valor agregado)

```python
def has_purchased(db: Session, user_id: int, product_id: int) -> bool:
    return db.query(OrderItem).join(Order).filter(
        Order.user_id == user_id,
        Order.status == OrderStatus.PAID,
        OrderItem.product_id == product_id,
    ).first() is not None
```

Muestra la insignia "Compra verificada" en la reseña. Es un diferenciador real para el acta.

---

## Paso 11 — Importación del catálogo desde Excel

Cubre **RF-07** y **O4** (migrar el 100 % del catálogo).

### 11.1 Contrato del Excel del propietario

| Columna | Obligatoria | Ejemplo |
|---|---|---|
| `sku` | Sí | `MANGA-001` |
| `titulo` | Sí | `One Piece Vol. 1` |
| `autor` | No | `Eiichiro Oda` |
| `editorial` | No | `Panini` |
| `categoria` | No | `Manga` |
| `precio` | Sí | `8990` |
| `stock` | Sí | `12` |
| `descripcion` | No | `Tomo inicial...` |

### 11.2 Script con validación, *dry-run* e idempotencia

`backend/scripts/import_catalog.py`:

```python
import argparse
import sys
from decimal import Decimal
from pathlib import Path

import pandas as pd
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.product import Product, Category, Inventory
from app.models.user import User  # asegura el mapeo completo

REQUIRED = {"sku", "titulo", "precio", "stock"}


def load_dataframe(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, dtype=str).fillna("")
    df.columns = [c.strip().lower() for c in df.columns]
    missing = REQUIRED - set(df.columns)
    if missing:
        sys.exit(f"Faltan columnas obligatorias: {', '.join(sorted(missing))}")
    return df


def run(path: Path, dry_run: bool, limit: int | None = None) -> None:
    df = load_dataframe(path)
    db = SessionLocal()
    created = updated = skipped = errors = 0

    try:
        for idx, row in df.iterrows():
            if limit and idx >= limit:
                break
            sku = str(row["sku"]).strip()
            try:
                price = Decimal(str(row["precio"]).replace(".", "").replace(",", "") or "0")
                stock = int(float(row["stock"] or 0))
            except (ValueError, ArithmeticError):
                print(f"[ERROR] fila {idx + 2}: precio/stock inválido → {sku}")
                errors += 1
                continue

            if not sku or price <= 0:
                print(f"[SKIP] fila {idx + 2}: SKU vacío o precio 0")
                skipped += 1
                continue

            product = db.scalar(select(Product).where(Product.sku == sku))
            if product:
                product.title = row["titulo"] or product.title
                product.price = price
                product.author = row.get("autor") or product.author
                if product.inventory:
                    product.inventory.quantity = stock
                updated += 1
            else:
                category_name = (row.get("categoria") or "General").strip()
                category = db.scalar(select(Category).where(Category.name == category_name))
                if not category:
                    category = Category(
                        name=category_name,
                        slug=category_name.lower().replace(" ", "-"),
                    )
                    db.add(category)
                    db.flush()

                product = Product(
                    sku=sku,
                    title=row["titulo"],
                    author=row.get("autor") or None,
                    publisher=row.get("editorial") or None,
                    description=row.get("descripcion") or None,
                    price=price,
                    category_id=category.id,
                )
                db.add(product)
                db.flush()
                db.add(Inventory(product_id=product.id, quantity=stock))
                created += 1

        if dry_run:
            db.rollback()
            print(f"[DRY-RUN] se revertiría todo → crear={created}, actualizar={updated}, "
                  f"omitir={skipped}, errores={errors}")
        else:
            db.commit()
            print(f"[OK] crear={created}, actualizar={updated}, omitir={skipped}, errores={errors}")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa el catálogo Excel a PostgreSQL")
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    run(args.file, args.dry_run, args.limit)
```

Uso:

```bash
# 1. Copiar el Excel al contenedor/volumen
docker compose cp data/catalogo.xlsx api:/data/catalogo.xlsx

# 2. Ensayo (no escribe nada)
docker compose exec api python -m scripts.import_catalog --file /data/catalogo.xlsx --dry-run

# 3. Importación real
docker compose exec api python -m scripts.import_catalog --file /data/catalogo.xlsx

# 4. Verificar
docker compose exec db psql -U alpaca -d alpacachino -c "SELECT count(*) FROM products;"
```

> El script es **idempotente por SKU**: se puede correr dos veces sin duplicar productos. Esto es
> lo que permite migrar el catálogo "en caliente" y volver a sincronizar cuando el dueño
> actualice su Excel.

---

## Paso 12 — Bots de WhatsApp e Instagram

Cubre **RF-11**, **O5** (80 % de consultas frecuentes) y **R02** (bloqueo por spam de Meta).

### 12.1 Flujo general

```
Usuario ──mensaje──► Meta Webhook ──POST──► /api/webhooks/whatsapp
                                                │
                                    1. Verificar firma (X-Hub-Signature-256)
                                    2. Encolar en Celery (responder 200 < 5 s)
                                                │
                                                ▼
                                    worker: clasificar intención
                                    ├── saludo / horario / envíos / precios
                                    │     └─ respuesta plantilla
                                    ├── "busco <título>"
                                    │     └─ buscar en catálogo → responder con link
                                    ├── "quiero comprar"
                                    │     └─ registrar intención + link al checkout
                                    └── desconocida
                                          └─ derivar a humano + notificar
```

### 12.2 Verificación del webhook

```python
from fastapi import APIRouter, Request, Query, HTTPException, Response
from app.core.config import settings

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/whatsapp")
def verify_whatsapp(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(403, "Verificación fallida")


@router.post("/whatsapp")
async def receive_whatsapp(request: Request):
    body = await request.json()
    # responder 200 rápido, procesar en background (R02: no bloquear a Meta)
    from app.tasks import handle_bot_message
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                handle_bot_message.delay(
                    channel="whatsapp",
                    sender=msg["from"],
                    text=msg.get("text", {}).get("body", ""),
                    message_id=msg["id"],
                )
    return {"status": "received"}
```

### 12.3 Motor de intenciones con umbral del 80 %

`backend/app/services/bots/intents.py`:

```python
import re

INTENTS: list[tuple[str, re.Pattern]] = [
    ("saludo",     re.compile(r"\b(hola|buenas|hey|buen día)\b", re.I)),
    ("horario",    re.compile(r"\b(horario|abierto|atienden|cierran)\b", re.I)),
    ("envios",     re.compile(r"\b(envío|envio|despacho|llega|starken|chilexpress)\b", re.I)),
    ("pago",       re.compile(r"\b(pago|transferencia|tarjeta|webpay|mercado ?pago)\b", re.I)),
    ("stock",      re.compile(r"\b(hay|tienen|stock|disponible)\b", re.I)),
    ("precio",     re.compile(r"\b(precio|cuánto|cuanto|vale)\b", re.I)),
    ("compra",     re.compile(r"\b(comprar|quiero|pedir|encargar)\b", re.I)),
]

RESPONSES = {
    "saludo": "¡Hola! 🦙 Soy el asistente de Alpacachino Store. ¿Buscas algún manga o cómic?",
    "horario": "Atendemos de lunes a sábado, de 10:00 a 20:00 hrs.",
    "envios": "Enviamos a todo Chile por Starken y Chilexpress. Despacho en 24-48 h hábiles.",
    "pago": "Aceptamos Webpay, MercadoPago y transferencia bancaria.",
}


def classify(text: str, catalog_lookup) -> tuple[str, str]:
    normalized = text.strip()
    for intent, pattern in INTENTS:
        if pattern.search(normalized):
            if intent in ("stock", "precio", "compra") and (match := catalog_lookup(normalized)):
                return intent, match
            return intent, RESPONSES.get(intent, "")
    return "desconocida", ""
```

Métrica de éxito de O5 (≥ 80 %):

```python
def resolution_rate(db: Session) -> float:
    total = db.query(BotMessage).filter(BotMessage.direction == "in").count()
    resolved = db.query(BotMessage).filter(
        BotMessage.direction == "in",
        BotMessage.resolved_by_bot.is_(True),
    ).count()
    return round(100 * resolved / total, 1) if total else 0.0
```

Expón la métrica en `/api/admin/bots/stats` para demostrar el cumplimiento del objetivo.

### 12.4 Buenas prácticas frente a R02 (bloqueo por Meta)

- Responde **200 en menos de 5 segundos** y procesa en Celery.
- Usa **plantillas aprobadas** para mensajes proactivos (fuera de la ventana de 24 h).
- Añade *jitter* entre envíos masivos (`sleep(random.uniform(0.5, 1.5))`).
- Guarda `message_id` con restricción única para no reprocesar reintentos de Meta.
- Registra cada error 4xx/5xx de la Graph API y alerta si supera el 5 % de envíos.
- Prueba primero con un número de test autorizado.

### 12.5 Configuración en Meta

1. Crear app tipo *Business* en developers.facebook.com.
2. Agregar producto **WhatsApp** → obtener `Phone Number ID` y token permanente (System User).
3. Agregar producto **Instagram** → vincular cuenta profesional → *Messaging*.
4. En *Webhooks*: URL `https://api.alpacachino.com/api/webhooks/whatsapp`, token de verificación.
5. Suscribir eventos `messages` y `message_status`.
6. En desarrollo, exponer el local con un túnel (`cloudflared tunnel --url http://localhost:8000`).

---

## Paso 13 — Frontend React con Vite

Cubre **RNF-01** (responsive) y **RNF-07** (navegadores modernos).

### 13.1 Inicializar el proyecto

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom @tanstack/react-query axios zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

> Como el contenedor `web` monta `./frontend`, puedes correr estos comandos en tu máquina o con
> `docker compose exec web npm ...`. Los `node_modules` quedan en un volumen anónimo para no
> chocar con tu sistema de archivos.

### 13.2 `vite.config.ts` con proxy al backend

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://api:8000",   // nombre del servicio en Compose
        changeOrigin: true,
      },
    },
  },
});
```

Con este proxy, el frontend llama `fetch("/api/products")` y no hay problemas de CORS en
desarrollo.

### 13.3 Estructura de rutas

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Forum from "./pages/Forum";
import PostDetail from "./pages/PostDetail";
import AdminLayout from "./admin/AdminLayout";
import AdminProducts from "./admin/AdminProducts";
import AdminOrders from "./admin/AdminOrders";
import RequireAuth from "./components/RequireAuth";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalogo" element={<Catalog />} />
          <Route path="/producto/:sku" element={<ProductDetail />} />
          <Route path="/carrito" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/foro" element={<Forum />} />
          <Route path="/foro/:id" element={<PostDetail />} />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route path="productos" element={<AdminProducts />} />
            <Route path="pedidos" element={<AdminOrders />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

### 13.4 Cliente HTTP con token

```ts
// src/api/client.ts
import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
```

### 13.5 Carrito con Zustand

```ts
// src/store/cart.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: number;
  sku: string;
  title: string;
  price: number;
  quantity: number;
  coverUrl?: string;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
  total: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const found = s.items.find((i) => i.productId === item.productId);
          return found
            ? { items: s.items.map((i) => (i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i)) }
            : { items: [...s.items, { ...item, quantity: 1 }] };
        }),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.productId !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.productId === id ? { ...i, quantity: Math.max(1, qty) } : i)),
        })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((acc, i) => acc + i.price * i.quantity, 0),
    }),
    { name: "alpacachino-cart" },
  ),
);
```

### 13.6 Responsive (RNF-01)

- Mobile-first con Tailwind: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6`.
- Navegación con menú hamburguesa bajo `md`.
- Imágenes con `aspect-[3/4] object-cover` y `loading="lazy"`.
- Prueba con DevTools en 375 px, 768 px y 1440 px.

### 13.7 Accesibilidad y SEO mínimos

- Contraste AA, `alt` en imágenes, foco visible.
- Títulos y metadatos por página (`react-helmet-async`).
- Skeleton loaders en el catálogo para percibir velocidad (RNF-06).

---

## Paso 14 — Dockerfiles de producción y Nginx

### 14.1 Backend multi-stage

`backend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# ---------- Base común ----------
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/*

# ---------- Desarrollo ----------
FROM base AS development
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---------- Producción ----------
FROM base AS production
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt gunicorn
COPY . .
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/health || exit 1
CMD ["gunicorn", "app.main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "2", "-b", "0.0.0.0:8000", "--timeout", "60"]
```

> `-w 2` es prudente para el plan gratuito de Render (512 MB). Más workers = más RAM.

### 14.2 Frontend multi-stage con Nginx

`frontend/Dockerfile`:

```dockerfile
# ---------- Build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- Servir ----------
FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
```

`frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Cache agresivo para assets con hash
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA: cualquier ruta desconocida devuelve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy a la API (mismo origen → sin CORS)
    location /api/ {
        proxy_pass http://api:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }

    # Cabeceras de seguridad
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

### 14.3 `docker-compose.prod.yml`

```yaml
services:
  api:
    build:
      context: ./backend
      target: production
    restart: always
    env_file: .env
    command: >
      sh -c "alembic upgrade head &&
             gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000"
    ports: []

  worker:
    build:
      context: ./backend
      target: production
    restart: always
    command: celery -A app.worker.celery_app worker -l warning --concurrency=2

  web:
    build:
      context: ./frontend
      target: production
    restart: always
    ports:
      - "80:80"
    depends_on: [api]

  db:
    restart: always
  redis:
    restart: always
```

Uso local de producción:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Paso 15 — Pruebas automatizadas

Cubre el criterio de calidad del acta y **RNF-06 / RNF-08**.

### 15.1 Backend: `pytest` con base de datos de prueba

`backend/tests/conftest.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base, get_db
from app.main import app

TEST_DB = "postgresql+psycopg://alpaca:alpaca_dev_pass@db:5432/alpacachino_test"


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DB)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def db(engine):
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Prueba crítica de concurrencia (R05):

```python
# tests/test_inventory.py
from concurrent.futures import ThreadPoolExecutor
from app.services.inventory import reserve_stock
import pytest
from fastapi import HTTPException


def test_no_se_vende_el_mismo_ejemplar_dos_veces(db):
    from app.models.product import Product, Inventory
    p = Product(sku="TEST-1", title="Último tomo", price=9990)
    db.add(p); db.flush()
    db.add(Inventory(product_id=p.id, quantity=1)); db.commit()

    def intentar():
        try:
            reserve_stock(db, p.id, 1)
            return "ok"
        except HTTPException:
            db.rollback()
            return "sin-stock"

    with ThreadPoolExecutor(max_workers=2) as ex:
        resultados = list(ex.map(lambda _: intentar(), range(2)))

    assert sorted(resultados) == ["ok", "sin-stock"]
```

### 15.2 Frontend: Vitest + Testing Library

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

```ts
// src/store/cart.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useCart } from "./cart";

describe("carrito", () => {
  beforeEach(() => useCart.setState({ items: [] }));

  it("suma cantidades del mismo producto", () => {
    useCart.getState().add({ productId: 1, sku: "A", title: "Tomo", price: 1000 });
    useCart.getState().add({ productId: 1, sku: "A", title: "Tomo", price: 1000 });
    expect(useCart.getState().items[0].quantity).toBe(2);
    expect(useCart.getState().total()).toBe(2000);
  });
});
```

### 15.3 E2E con Playwright (flujo crítico del PMV)

```ts
// e2e/compra.spec.ts
import { test, expect } from "@playwright/test";

test("compra completa como cliente", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("link", { name: /One Piece/ }).first().click();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/carrito");
  await page.getByRole("button", { name: "Ir a pagar" }).click();
  await expect(page).toHaveURL(/checkout/);
});
```

Ejecutar todo:

```bash
docker compose exec api pytest -q
docker compose exec web npx vitest run
npx playwright test
```

---

## Paso 16 — CI/CD con GitHub Actions

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: alpaca
          POSTGRES_PASSWORD: alpaca
          POSTGRES_DB: alpacachino_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      SECRET_KEY: ci-secret-key-with-at-least-32-characters
      POSTGRES_HOST: localhost
      POSTGRES_USER: alpaca
      POSTGRES_PASSWORD: alpaca
      POSTGRES_DB: alpacachino_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r backend/requirements.txt
      - run: pip install ruff
      - run: ruff check backend/app
      - run: pytest -q
        working-directory: backend

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npm run lint
        working-directory: frontend
      - run: npm run build
        working-directory: frontend

  docker:
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build imágenes de producción
        run: docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

Reglas de rama: `main` protegida, PR obligatorio, revisión de al menos un integrante
(RNF-08, y buena práctica para 4 personas).

---

## Paso 17 — Despliegue del PMV

El acta fija Vercel + Render + Supabase. La app **también** debe correr en contenedores
(requisito de esta guía), así que se cubren ambos caminos.

### 17.1 Opción A — Nube gestionada (la del acta)

| Componente | Plataforma | Configuración |
|---|---|---|
| Frontend React | **Vercel** | Root `frontend`, build `npm run build`, output `dist`, env `VITE_API_URL=https://api.alpacachino.com` |
| API FastAPI | **Render** (Web Service, Docker) | Dockerfile `backend/Dockerfile` target `production`, health check `/api/health` |
| Worker + Beat | **Render** (Background Worker) | Mismo Dockerfile, comando `celery -A app.worker.celery_app worker -l info` |
| PostgreSQL | **Supabase** | Usar el *Connection Pooler* (puerto 6543) para serverless |
| Redis | **Upstash** (free tier) | `REDIS_URL` con TLS (`rediss://`) |
| Dominio | Cloudflare | `alpacachino.com` → Vercel; `api.alpacachino.com` → Render |

**Pasos concretos:**

1. **Supabase**: crear proyecto → *SQL Editor* → habilitar extensiones:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
   Copiar la cadena de conexión del **pooler** y añadir `?sslmode=require`.
2. **Render**: *New → Web Service → Deploy from Dockerfile*.
   - `Dockerfile Path`: `backend/Dockerfile`
   - `Docker Build Context Directory`: `backend`
   - Añadir todas las variables de `.env` en *Environment*.
   - *Pre-Deploy Command*: `alembic upgrade head`.
   - Health Check Path: `/api/health`.
3. **Render Background Worker** para Celery (`celery -A app.worker.celery_app worker`).
4. **Vercel**: importar repo, root `frontend`, framework *Vite*, variable `VITE_API_URL`.
5. **DNS**: CNAME `api` → `xxx.onrender.com`; `www` y apex → Vercel.
6. **CORS**: en Render, `BACKEND_CORS_ORIGINS=https://alpacachino.com,https://www.alpacachino.com`.
7. **Webhooks de Meta y MercadoPago**: apuntar a `https://api.alpacachino.com/api/...`.

> **Aviso Free Tier (R04)**: Supabase pausa proyectos inactivos por 7 días y Render duerme el
> servicio tras 15 min sin tráfico (primer request tarda ~30-50 s). Para el PMV académico es
> aceptable; si el dueño empieza a vender, hay que pasar a plan pago o usar un *keep-alive*.

### 17.2 Opción B — VPS con Docker Compose (control total)

```bash
# En el servidor (Ubuntu 24.04, 2 GB RAM)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone https://github.com/<org>/alpacachino-store.git
cd alpacachino-store
cp .env.example .env && nano .env      # secretos reales
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

TLS con Caddy (automático con Let's Encrypt):

```yaml
# docker-compose.caddy.yml
services:
  caddy:
    image: caddy:2-alpine
    restart: always
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    networks: [alpacachino_net]

volumes:
  caddy_data:
```

```
# Caddyfile
alpacachino.com {
    reverse_proxy web:80
}
api.alpacachino.com {
    reverse_proxy api:8000
}
```

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.caddy.yml up -d --build
```

### 17.3 Verificación post-despliegue (Definition of Done)

```bash
curl -I https://alpacachino.com                      # 200 + HSTS
curl https://api.alpacachino.com/api/health          # {"status":"ok"}
curl -I http://alpacachino.com                       # 301 → https
```

- [ ] Catálogo visible con imágenes.
- [ ] Registro y login funcionando.
- [ ] Checkout completo con pago sandbox aprobado.
- [ ] Panel admin accesible solo con rol `admin`.
- [ ] Foro con publicación y moderación.
- [ ] Bot responde en el número de prueba.
- [ ] `alembic current` en la BD de producción apunta a la última revisión.

---

## Paso 18 — Seguridad, respaldo y cumplimiento legal

Cubre **RNF-02**, **RNF-03** y las restricciones normativas del acta.

### 18.1 Checklist de seguridad

- [ ] HTTPS obligatorio y HSTS (RNF-03).
- [ ] Contraseñas con bcrypt/argon2 (RNF-02). Nunca en logs.
- [ ] JWT con expiración corta (30 min) + refresh.
- [ ] Rate limiting en `/auth/*` (5 intentos/min por IP) y en escritura del foro.
- [ ] Validación de entrada con Pydantic en **todos** los endpoints.
- [ ] Consultas parametrizadas (SQLAlchemy/`text()` con parámetros). Cero f-strings en SQL.
- [ ] CORS restringido a los dominios propios.
- [ ] Cabeceras de seguridad en Nginx (X-Frame-Options, nosniff, Referrer-Policy, CSP).
- [ ] Secretos fuera del repo; rotación al egreso de un integrante.
- [ ] Dependencias auditadas: `pip-audit` y `npm audit` en CI.
- [ ] Backups automáticos de Supabase (plan pago) o `pg_dump` diario en VPS.
- [ ] Logs sin datos personales (enmascarar email/teléfono).
- [ ] Principio de mínimo privilegio en roles (`customer` < `moderator` < `admin`).

### 18.2 Cumplimiento normativo chileno

| Norma | Implicancia práctica |
|---|---|
| **Ley 19.628 / 21.719** (protección de datos) | Política de privacidad, consentimiento, derecho de acceso/rectificación/eliminación, registro del tratamiento |
| **Ley 19.496** (derechos del consumidor) | Precio final visible, stock real, derecho a retracto (10 días), datos de contacto del vendedor |
| **Ley 19.799** (firma electrónica) | Boleta/factura electrónica vía SII cuando corresponda |
| **Políticas de Meta** | Consentimiento y *opt-in* para mensajes proactivos, ventana de 24 h |

Implementación mínima:

- Página `/privacidad` y `/terminos` con el detalle de datos recolectados.
- Endpoint `DELETE /api/users/me` que anonimiza la cuenta (mantiene pedidos por obligación
  tributaria, pero borra datos personales).
- Casilla de consentimiento explícita en el registro (checkbox no premarcado).

### 18.3 Respaldos

```bash
# Backup lógico
docker compose exec -T db pg_dump -U alpaca -d alpacachino -Fc > backup_$(date +%F).dump

# Restauración
docker compose exec -T db pg_restore -U alpaca -d alpacachino --clean < backup_2026-10-24.dump
```

Programar diariamente con cron y guardar fuera del servidor (S3 / Drive). Un backup que nunca
se probó restaurar no es un backup.

---

## Paso 19 — Observabilidad y límites del Free Tier

### 19.1 Logs estructurados

```python
# backend/app/core/logging.py
import logging, sys, json

class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "level": record.levelname,
            "msg": record.getMessage(),
            "logger": record.name,
            "time": self.formatTime(record),
        }, ensure_ascii=False)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
```

Todos los logs van a `stdout` → Docker/Render los captura. Nunca a archivos dentro del
contenedor (se pierden).

### 19.2 Métricas mínimas del PMV

| Métrica | Dónde | Umbral de alerta |
|---|---|---|
| Latencia p95 del catálogo | Render / Nginx | > 1.5 s |
| Errores 5xx | Logs | > 1 % de requests |
| Reservas expiradas / hora | Tarea Celery | > 20 (posible abandono o bot) |
| Stock en 0 con ventas activas | Admin | > 0 |
| Uso de ancho de banda Supabase | Panel Supabase | > 70 % del free tier (R04) |
| Tasa de respuesta automática del bot | `/admin/bots/stats` | < 80 % (O5) |

### 19.3 Mitigaciones de R04 (límites del Free Tier)

1. Imágenes comprimidas a WebP ≤ 150 KB, servidas desde CDN (Cloudinary free / Supabase Storage).
2. Paginación estricta (máx. 12 productos por página).
3. Cache de catálogo en Redis (`@cache(ttl=300)`) para no golpear la BD en cada visita.
4. `keep-alive` con un ping cada 10 min (solo para demo, no para producción real).
5. Reserva de $40.000 CLP del presupuesto ya contemplada para upgrade temporal.

### 19.4 Tabla riesgo → mitigación técnica implementada

| Riesgo | Mitigación en el código |
|---|---|
| **R01** código heredado vulnerable | `pip-audit`, `ruff`, revisión de PR, sin secretos en repo, hashes modernos |
| **R02** bloqueo de API de Meta | respuesta 200 inmediata + Celery, plantillas aprobadas, jitter, dedupe por `message_id` |
| **R03** fallo de pasarela | patrón Strategy, sandbox obligatorio, webhook idempotente, re-consulta del estado |
| **R04** límites Free Tier | imágenes WebP, cache Redis, paginación, monitoreo de cuota |
| **R05** sobreventa | `UPDATE ... WHERE quantity >= :qty`, `CHECK (quantity >= 0)`, reserva con TTL, prueba de concurrencia |

---

## Cronograma: acta vs. pasos técnicos

| Fase (acta) | Plazo | Pasos de esta guía | Entregable verificable |
|---|---|---|---|
| **1. Inicialización** | Mes 1 | Pasos 0–4: entorno, Compose, esquema, migraciones | `docker compose up` funciona; `alembic upgrade head` OK; `docs/arquitectura.md` |
| **2. Desarrollo** | Meses 2–3 | Pasos 5–13: auth, catálogo, checkout, pagos, admin, foro, bots, frontend | RF-01…RF-11 implementados; pruebas en verde |
| **3. Despliegue** | Mes 4 | Pasos 14–19: Dockerfiles prod, CI/CD, despliegue, seguridad, monitoreo | PMV en `alpacachino.com` con HTTPS y pago sandbox |

Sugerencia de reparto según los roles del acta:

- **Lucas (PM + Fullstack)**: coordinación, Pasos 2–4, revisión de PR, despliegue.
- **Leandro (Backend + Infra)**: Pasos 3, 4, 14, 17, 18 (Supabase, Docker, backups).
- **Damián (Pentesting + Bots Backend)**: Pasos 5, 12, 18.1 (seguridad, webhooks Meta).
- **Sebastián (Fullstack / React Native)**: Pasos 6, 13 y la app móvil posterior.

---

## Checklist de aceptación del PMV

Cruzando los criterios de éxito del acta con verificaciones técnicas concretas:

| Criterio del acta | Verificación |
|---|---|
| Catálogo, carrito y pago funcionando extremo a extremo | E2E Playwright en verde + pago sandbox aprobado |
| El dueño administra productos/stock/pedidos sin apoyo | Demo del panel admin con usuario `admin`, sin tocar la BD |
| Catálogo migrado desde marketplace | `SELECT count(*) FROM products` ≥ filas del Excel; script idempotente |
| Foro activo con usuarios y publicaciones | Registro + post + comentario + reseña verificada |
| Bots responden ≥ 80 % de consultas frecuentes | `/api/admin/bots/stats` ≥ 80 % |
| Requisitos no funcionales | Lighthouse ≥ 90 en móvil; p95 < 3 s; HTTPS; hashes; sin sobreventa |

Comandos de cierre:

```bash
docker compose exec api pytest -q
docker compose exec api alembic current
docker compose exec db psql -U alpaca -d alpacachino -c "SELECT count(*) FROM products;"
curl -s https://api.alpacachino.com/api/health
```

---

## Anexos

### A. Comandos esenciales

```bash
# Levantar / bajar todo
docker compose up -d --build
docker compose down

# Estado y logs
docker compose ps
docker compose logs -f --tail=100 api

# Base de datos
docker compose exec db psql -U alpaca -d alpacachino
docker compose exec api alembic revision --autogenerate -m "cambio"
docker compose exec api alembic upgrade head
docker compose exec api alembic downgrade -1

# Pruebas
docker compose exec api pytest -q
docker compose exec web npm run test

# Limpieza
docker system prune -af --volumes      # ⚠ borra TODO lo no usado
docker compose down -v                 # ⚠ borra la BD local
```

### B. Errores frecuentes y solución

| Síntoma | Causa | Solución |
|---|---|---|
| `could not translate host name "db"` | La API arrancó antes que Postgres o no está en la red | Verifica `depends_on` + `healthcheck` y `networks` |
| `password authentication failed` | `.env` cambió después de crear el volumen | `docker compose down -v` (borra datos) o ajusta credenciales |
| `Port 5432 already in use` | Otro PostgreSQL local ocupa el puerto | Cambia a `"5433:5432"` en Compose |
| Hot reload no detecta cambios (Windows) | Volumen con soporte de *polling* | Añade `WATCHFILES_FORCE_POLLING=true` al servicio `api` |
| `npm install` lento o `node_modules` corrupto | Volumen anónimo desactualizado | `docker compose down && docker compose up -d --build web` |
| Alembic autogenerate no detecta tablas | Falta importar el modelo en `app/models/__init__.py` | Añade el import |
| `401` en todos los endpoints | Token vencido o `SECRET_KEY` distinta entre servicios | Revisa `.env` compartido y expiración |
| Webhook de Meta no llega | URL no pública o verificación fallida | Usa `cloudflared tunnel` y revisa el `verify_token` |
| Pago aprobado pero pedido `PENDING` | Webhook no alcanzó el servidor | Revisa `notification_url`, logs y prueba con `curl` local |
| `this project is paused` (Supabase) | Inactividad > 7 días | Restaurar desde el panel o hacer ping periódico |

### C. Recursos de referencia

- FastAPI: <https://fastapi.tiangolo.com/>
- SQLAlchemy 2.0: <https://docs.sqlalchemy.org/en/20/>
- Alembic: <https://alembic.sqlalchemy.org/>
- Docker Compose: <https://docs.docker.com/compose/>
- Vite + React: <https://vite.dev/guide/>
- TanStack Query: <https://tanstack.com/query/latest>
- WhatsApp Cloud API: <https://developers.facebook.com/docs/whatsapp/cloud-api>
- Instagram Messaging: <https://developers.facebook.com/docs/messenger-platform/instagram>
- MercadoPago Checkout Pro: <https://www.mercadopago.cl/developers/es/docs/checkout-pro/landing>
- Transbank Webpay Plus: <https://www.transbankdevelopers.cl/documentacion/webpay-plus>
- Supabase: <https://supabase.com/docs>

---

**Documento generado como guía de implementación del Acta de Constitución de AlpacachinoStore.**
Mantener actualizado cuando cambie el stack, el esquema de datos o el proveedor de
infraestructura; forma parte del entregable de la Fase 1 (`docs/arquitectura.md`).
