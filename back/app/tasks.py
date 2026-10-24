"""Celery tasks."""

from app.worker import celery_app
from app.db.session import SessionLocal
from app.models.order import Order, OrderStatus
from app.services import inventory
from datetime import datetime, timezone


@celery_app.task(name="app.tasks.ping")
def ping() -> str:
    return "pong"


@celery_app.task(name="app.tasks.expire_reservations")
def expire_reservations() -> int:
    """Libera stock de pedidos PENDING vencidos (ejecuta cada minuto)."""
    db = SessionLocal()
    try:
        expired = db.query(Order).filter(
            Order.status == OrderStatus.PENDING,
            Order.expires_at < datetime.now(timezone.utc),
        ).all()

        count = 0
        for order in expired:
            for item in order.items:
                inventory.release_stock(db, str(item.product_id), item.quantity)
            order.status = OrderStatus.EXPIRED
            count += 1

        db.commit()
        return count
    finally:
        db.close()


@celery_app.task(name="app.tasks.daily_report")
def daily_report() -> dict:
    """Genera reporte diario para admin (ejecuta a las 8 AM)."""
    return {"status": "pendiente-de-implementar"}


@celery_app.task(name="app.tasks.send_order_confirmation")
def send_order_confirmation(order_id: int) -> bool:
    """Envía correo de confirmación de pedido."""
    # TODO: implementar con SMTP real
    print(f"[EMAIL] Confirmación de pedido {order_id} enviada")
    return True


@celery_app.task(name="app.tasks.handle_bot_message")
def handle_bot_message(channel: str, sender: str, text: str, message_id: str) -> dict:
    """Procesa mensaje entrante de WhatsApp/Instagram (placeholder)."""
    print(f"[BOT] {channel} - {sender}: {text}")
    return {"status": "queued"}