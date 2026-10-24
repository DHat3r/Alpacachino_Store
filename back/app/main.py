"""Punto de entrada de la API AlpacachinoStore."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.rate_limit import init_limiter
from app.api.routes import (
    auth,
    products,
    orders,
    payments,
    admin,
    forum,
    webhooks,
    health,
)

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="0.1.0",
    description="API del PMV de AlpacachinoStore (e-commerce + foro comunitario).",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# Rate limiting global (SlowAPI). Los endpoints sensibles lo aplican con @limiter.limit
init_limiter(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Cabeceras de seguridad recomendadas (RNF-02, OWASP básico)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        if settings.ENV == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Register all routers with /api prefix
for router in (auth, products, orders, payments, admin, forum, webhooks, health):
    app.include_router(router.router, prefix="/api")


@app.get("/", tags=["root"])
def root() -> dict:
    return {"app": settings.APP_NAME, "env": settings.ENV, "docs": "/docs"}
