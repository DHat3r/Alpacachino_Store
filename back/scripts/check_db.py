"""Comprueba la base de datos configurada (Supabase o PostgreSQL local).

Sirve para validar la cadena de conexión antes/después de apuntar la app a
Supabase y para ver el latido de stock en vivo.

Uso:
    docker compose exec -T api python scripts/check_db.py
    docker compose exec -T api python scripts/check_db.py --loop 5
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

# Permite `python scripts/check_db.py` desde /app (sys.path[0] es scripts/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.session import engine
from app.services import keepalive


def _target() -> str:
    """Describe el destino sin exponer la contraseña."""
    url = make_url(settings.database_url)
    origen = "DATABASE_URL" if settings.DATABASE_URL else "POSTGRES_* (local)"
    return f"{url.host}:{url.port}/{url.database}  [origen: {origen}]"


def _info() -> dict[str, object]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT current_database()            AS db,
                       current_user                  AS usr,
                       current_setting('server_version') AS version,
                       (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
                """
            )
        ).one()
        try:
            revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        except Exception:
            revision = None
    return {
        "db": row.db,
        "usuario": row.usr,
        "version": row.version,
        "ssl": row.ssl,
        "alembic": revision or "(sin migraciones)",
    }


def _supabase_status() -> str:
    """Comprueba la API de Supabase (no la base de datos)."""
    if not keepalive.supabase_configured():
        return "no configurado (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY vacías)"

    url = settings.SUPABASE_URL.rstrip("/")
    key = settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_SECRET_KEY
    try:
        inicio = time.perf_counter()
        res = httpx.get(f"{url}/auth/v1/settings", headers={"apikey": key}, timeout=10)
        ms = int((time.perf_counter() - inicio) * 1000)
        return f"HTTP {res.status_code} · {ms} ms · {url}"
    except Exception as exc:  # noqa: BLE001
        return f"ERROR {exc}"


def _print_report() -> None:
    info = _info()
    print(f"destino     : {_target()}")
    print(f"base        : {info['db']}  usuario: {info['usuario']}")
    print(f"servidor    : PostgreSQL {info['version']}")
    print(f"ssl         : {info['ssl']}")
    print(f"alembic     : {info['alembic']}")
    try:
        stock = keepalive.check_stock_once()
        print(
            "inventario  : {products} producto(s), {available} unidad(es) disponible(s), "
            "{inconsistent} inconsistente(s)".format(**stock)
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"inventario  : no disponible ({type(exc).__name__}). "
            "¿Falta correr 'alembic upgrade head'?"
        )
    print(f"supabase    : {_supabase_status()}")
    if not settings.DATABASE_URL:
        print(
            "aviso       : DATABASE_URL está vacía; la app sigue usando el PostgreSQL local.\n"
            "              Para usar Supabase define DATABASE_URL con la cadena del pooler."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica la conexión a la base de datos")
    parser.add_argument(
        "--loop",
        type=float,
        default=None,
        metavar="SEGUNDOS",
        help="repite la verificación de stock cada N segundos (Ctrl+C para salir)",
    )
    args = parser.parse_args()

    try:
        _print_report()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR de conexión: {exc}", file=sys.stderr)
        return 1

    if args.loop is None:
        return 0

    print(f"\nLatido cada {args.loop} s (Ctrl+C para salir)...")
    try:
        while True:
            time.sleep(args.loop)
            try:
                stock = keepalive.check_stock_once()
                print(
                    f"[{datetime.now():%H:%M:%S}] ok · "
                    f"{stock['products']} productos · {stock['available']} disponibles · "
                    f"{stock['inconsistent']} inconsistentes"
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[{datetime.now():%H:%M:%S}] fallo: {exc}", file=sys.stderr)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
