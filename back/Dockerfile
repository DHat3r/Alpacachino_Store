# syntax=docker/dockerfile:1

# ─────────────────────────── Base común ───────────────────────────
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/*

# ─────────────────────────── Desarrollo ───────────────────────────
FROM base AS development
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq-dev \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─────────────────────────── Producción ───────────────────────────
FROM base AS production
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt gunicorn
COPY . .
RUN useradd -m -u 10001 appuser \
 && sed -i 's/\r$//' scripts/start.sh \
 && chmod +x scripts/start.sh \
 && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/health || exit 1
CMD ["sh", "scripts/start.sh"]
