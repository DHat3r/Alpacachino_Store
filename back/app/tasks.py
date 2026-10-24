"""Celery tasks."""

from datetime import datetime, timezone
from decimal import Decimal

from app.worker import celery_app
from app.db.session import SessionLocal
from app.models.order import Order, OrderStatus
from app.services import inventory
from app.services.email import send_email


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


def _order_email_body(order: Order) -> str:
    lineas = [
        f"Hola {order.user.username if order.user else ''},".strip(),
        "",
        f"Recibimos tu pedido #{order.id}.",
        "",
        "Detalle:",
    ]
    for item in order.items:
        titulo = item.product.title if item.product else f"Producto {item.product_id}"
        lineas.append(
            f"  - {item.quantity} x {titulo} (${int(item.unit_price):,} c/u)".replace(",", ".")
        )
    lineas += [
        "",
        f"Subtotal: ${int(order.subtotal):,}".replace(",", "."),
        f"Envío: ${int(order.shipping):,}".replace(",", "."),
        f"Total: ${int(order.total):,}".replace(",", "."),
        "",
        "Te avisaremos cuando el pedido esté en camino.",
        "",
        "AlpacachinoStore",
    ]
    return "\n".join(lineas)


@celery_app.task(name="app.tasks.daily_report")
def daily_report() -> dict:
    """Resumen diario para el administrador (8 AM)."""
    from app.models.user import User, UserRole

    db = SessionLocal()
    try:
        hoy = datetime.now(timezone.utc).date()
        pedidos = (
            db.query(Order)
            .filter(Order.created_at >= datetime(hoy.year, hoy.month, hoy.day, tzinfo=timezone.utc))
            .all()
        )
        pagados = [o for o in pedidos if o.status == OrderStatus.PAID]
        ingresos = sum((o.total for o in pagados), Decimal(0))
        bajos = inventory.get_low_stock()

        resumen = {
            "pedidos": len(pedidos),
            "pagados": len(pagados),
            "ingresos": int(ingresos),
            "stock_bajo": len(bajos),
        }

        admin = (
            db.query(User)
            .filter(User.role == UserRole.ADMIN, User.is_active.is_(True))
            .first()
        )
        if admin:
            send_email(
                admin.email,
                f"Resumen diario AlpacachinoStore — {hoy.isoformat()}",
                (
                    f"Pedidos creados: {resumen['pedidos']}\n"
                    f"Pedidos pagados: {resumen['pagados']}\n"
                    f"Ingresos: ${resumen['ingresos']:,}\n".replace(",", ".")
                    + f"Productos con stock bajo: {resumen['stock_bajo']}\n"
                ),
            )
        return resumen
    finally:
        db.close()


@celery_app.task(name="app.tasks.send_order_confirmation")
def send_order_confirmation(order_id: int) -> bool:
    """Envía el correo de confirmación del pedido por SMTP."""
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            return False
        to = order.user.email if order.user else ""
        return send_email(
            to,
            f"Pedido #{order.id} confirmado — AlpacachinoStore",
            _order_email_body(order),
        )
    finally:
        db.close()


@celery_app.task(name="app.tasks.handle_bot_message")
def handle_bot_message(channel: str, sender: str, text: str, message_id: str) -> dict:
    """Procesa mensaje entrante de WhatsApp/Instagram (placeholder)."""
    print(f"[BOT] {channel} - {sender}: {text}")
    return {"status": "queued"}
