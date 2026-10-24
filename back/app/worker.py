"""Aplicación Celery y tareas programadas."""

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
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "ping-cada-5-minutos": {
            "task": "app.tasks.ping",
            "schedule": 300.0,
        },
        "reporte-diario": {
            "task": "app.tasks.daily_report",
            "schedule": crontab(hour=8, minute=0),
        },
    },
)
