"""Latido periódico contra la base de datos.

Por qué existe: Supabase (sobre todo con el pooler y en el plan gratuito)
cierra las conexiones ociosas y puede pausar el proyecto tras periodos largos
sin actividad. Un chequeo ligero cada pocos segundos mantiene la sesión viva y,
de paso, verifica el inventario (detecta stock negativo por reservas mal
liberadas).

Se controla con ``DB_KEEPALIVE_SECONDS``:

- ``5`` (por defecto): consulta el inventario cada 5 segundos.
- ``0``: lo desactiva (lo usan las pruebas).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# Consulta barata: cuenta filas de inventario, suma lo disponible (``quantity``
# ya excluye lo reservado) y detecta inconsistencias: productos cuyo
# ``reserved`` no coincide con lo apartado en pedidos pendientes.
_STOCK_SQL = text(
    """
    SELECT count(*)                                              AS products,
           coalesce(sum(i.quantity), 0)                          AS available,
           count(*) FILTER (WHERE i.reserved <> coalesce(p.qty, 0)) AS inconsistent
      FROM inventory i
      LEFT JOIN (
            SELECT oi.product_id, sum(oi.quantity) AS qty
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
             WHERE o.status = 'PENDING'
             GROUP BY oi.product_id
      ) p ON p.product_id = i.product_id
    """
)


@dataclass
class KeepaliveState:
    """Último resultado del latido, expuesto en ``/api/health``."""

    enabled: bool = False
    interval_seconds: int = 0
    checks: int = 0
    failures: int = 0
    last_check_at: str | None = None
    last_ok_at: str | None = None
    last_error: str | None = None
    products: int = 0
    available: int = 0
    inconsistent: int = 0
    # Proyecto Supabase (API HTTP), independiente de la base de datos.
    supabase_configured: bool = False
    supabase_ok: bool | None = None
    supabase_latency_ms: int | None = None
    supabase_last_check_at: str | None = None
    supabase_last_error: str | None = None


state = KeepaliveState()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def supabase_configured() -> bool:
    return bool(
        settings.SUPABASE_URL
        and (settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_SECRET_KEY)
    )


async def _check_supabase(client: httpx.AsyncClient) -> int:
    """Comprueba que el proyecto Supabase responde a la API de auth.

    Devuelve la latencia en milisegundos. Usa la clave pública (publishable),
    que es la adecuada para una comprobación desde el servidor.
    """
    url = settings.SUPABASE_URL.rstrip("/")
    key = settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_SECRET_KEY
    started = time.perf_counter()
    res = await client.get(f"{url}/auth/v1/settings", headers={"apikey": key})
    latency = int((time.perf_counter() - started) * 1000)
    res.raise_for_status()
    return latency


def check_stock_once(
    session_factory: Callable[[], Session] | sessionmaker | None = None,
) -> dict[str, int]:
    """Ejecuta la verificación de stock con una sesión corta.

    La sesión se abre y se cierra en cada latido para no retener una conexión
    del pool mientras el chequeo está inactivo.
    """
    factory = session_factory or SessionLocal
    with factory() as db:  # type: ignore[operator]
        row = db.execute(_STOCK_SQL).one()
    return {
        "products": int(row.products),
        "available": int(row.available),
        "inconsistent": int(row.inconsistent),
    }


async def _run(interval: int) -> None:
    """Bucle del latido. Se cancela al apagar la API."""
    hay_supabase = supabase_configured()
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            while True:
                state.last_check_at = _now()
                try:
                    summary = await asyncio.to_thread(check_stock_once)
                    state.checks += 1
                    state.products = summary["products"]
                    state.available = summary["available"]
                    state.inconsistent = summary["inconsistent"]
                    state.last_ok_at = state.last_check_at
                    state.last_error = None
                    if summary["inconsistent"]:
                        logger.warning(
                            "Inventario inconsistente en %s producto(s): lo reservado no cuadra con los pedidos pendientes",
                            summary["inconsistent"],
                        )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001 - el latido nunca debe tumbar la API
                    state.checks += 1
                    state.failures += 1
                    state.last_error = str(exc)[:200]
                    logger.warning("Latido de base de datos falló: %s", exc)

                if hay_supabase:
                    state.supabase_last_check_at = _now()
                    try:
                        state.supabase_latency_ms = await _check_supabase(http)
                        state.supabase_ok = True
                        state.supabase_last_error = None
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:  # noqa: BLE001
                        state.supabase_ok = False
                        state.supabase_last_error = str(exc)[:200]
                        logger.warning("Supabase no respondió: %s", exc)

                await asyncio.sleep(interval)
    finally:
        state.enabled = False


def start_keepalive() -> asyncio.Task | None:
    """Arranca el latido si está habilitado por configuración."""
    interval = settings.DB_KEEPALIVE_SECONDS
    state.interval_seconds = interval
    state.supabase_configured = supabase_configured()

    if interval <= 0:
        state.enabled = False
        logger.info("Latido de base de datos desactivado (DB_KEEPALIVE_SECONDS=0)")
        return None

    state.enabled = True
    logger.info("Latido de base de datos activo cada %s segundos", interval)
    return asyncio.create_task(_run(interval), name="db-keepalive")


async def stop_keepalive(task: asyncio.Task | None) -> None:
    """Cancela el latido y espera a que termine."""
    if task is None:
        state.enabled = False
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    state.enabled = False


def snapshot() -> dict[str, object]:
    """Estado del latido para el endpoint de salud."""
    return {
        "enabled": state.enabled,
        "interval_seconds": state.interval_seconds,
        "checks": state.checks,
        "failures": state.failures,
        "last_check_at": state.last_check_at,
        "last_ok_at": state.last_ok_at,
        "last_error": state.last_error,
        "stock": {
            "products": state.products,
            "available": state.available,
            "inconsistent": state.inconsistent,
        },
        "supabase": {
            "configured": state.supabase_configured,
            "ok": state.supabase_ok,
            "latency_ms": state.supabase_latency_ms,
            "last_check_at": state.supabase_last_check_at,
            "last_error": state.supabase_last_error,
        },
    }
