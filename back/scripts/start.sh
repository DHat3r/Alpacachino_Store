#!/bin/sh
# Arranque de producción: migra la base y luego levanta la API.
set -e

echo "[start] Aplicando migraciones Alembic…"
alembic upgrade head

echo "[start] Levantando API en el puerto ${PORT:-8000}…"
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w "${WEB_CONCURRENCY:-2}" \
  -b "0.0.0.0:${PORT:-8000}" \
  --timeout 60 \
  --access-logfile -
