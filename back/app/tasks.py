"""Tareas asíncronas de Celery.

Aquí se irán agregando:
  - expire_reservations  (liberar stock de pedidos vencidos)
  - send_order_confirmation (correo de compra)
  - handle_bot_message (WhatsApp / Instagram)
"""

from app.worker import celery_app


@celery_app.task(name="app.tasks.ping")
def ping() -> str:
    return "pong"


@celery_app.task(name="app.tasks.daily_report")
def daily_report() -> dict:
    """Placeholder del reporte diario para el panel administrativo."""
    return {"status": "pendiente-de-implementar"}
