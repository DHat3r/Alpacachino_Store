"""Datos de demostración para el frontend (4.3).

Crea ~8 categorías, 48 productos, 5 usuarios, 12 hilos con comentarios y
pedidos en todos los estados. Es idempotente: si encuentra el marcador
`DEMO-`/`@demo.cl` no duplica.

Uso (siempre contra el PostgreSQL local, no Supabase):

    docker compose exec -T api python scripts/seed_demo.py
    docker compose exec -T api python scripts/seed_demo.py --reset
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.forum import ForumComment, ForumPost  # noqa: E402
from app.models.order import Order, OrderItem, OrderStatus  # noqa: E402
from app.models.product import Category, Inventory, Product  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402

from sqlalchemy import or_  # noqa: E402

DEMO_PASSWORD = "Demo1234"
DEMO_DOMAIN = "@demo.cl"

CATEGORIAS = [
    ("Manga", "manga", "Tomos y volúmenes de manga japonés."),
    ("Cómic", "comic", "Cómics occidentales y novelas gráficas."),
    ("Manhwa", "manhwa", "Cómic coreano."),
    ("Novela ligera", "novela-ligera", "Light novels y adaptaciones."),
    ("Arte", "arte", "Artbooks, ilustración y diseño."),
    ("Coleccionables", "coleccionables", "Figuras, láminas y ediciones especiales."),
    ("Infantil", "infantil", "Lecturas para las y los más pequeños."),
    ("Ofertas", "ofertas", "Liquidaciones y packs."),
]

OBRAS = [
    ("One Piece Vol. {n}", "Eiichiro Oda", "Manga"),
    ("Naruto Vol. {n}", "Masashi Kishimoto", "Manga"),
    ("My Hero Academia Vol. {n}", "Kohei Horikoshi", "Manga"),
    ("Jujutsu Kaisen Vol. {n}", "Gege Akutami", "Manga"),
    ("Chainsaw Man Vol. {n}", "Tatsuki Fujimoto", "Manga"),
    ("Spy x Family Vol. {n}", "Tatsuya Endo", "Manga"),
    ("Berserk Vol. {n}", "Kentaro Miura", "Manga"),
    ("Batman: Año Uno", "Frank Miller", "Cómic"),
    ("Watchmen", "Alan Moore", "Cómic"),
    ("Saga Vol. {n}", "Brian K. Vaughan", "Cómic"),
    ("El Caballero Oscuro", "Frank Miller", "Cómic"),
    ("Solo Leveling Vol. {n}", "Chugong", "Manhwa"),
    ("Tower of God Vol. {n}", "SIU", "Manhwa"),
    ("Re:Zero Vol. {n}", "Tappei Nagatsuki", "Novela ligera"),
    ("KonoSuba Vol. {n}", "Natsume Akatsuki", "Novela ligera"),
    ("Artbook Ghibli {n}", "Studio Ghibli", "Arte"),
    ("Ilustración Digital {n}", "Varios", "Arte"),
    ("Figura Coleccionista {n}", "Varios", "Coleccionables"),
    ("Lámina Premium {n}", "Varios", "Coleccionables"),
    ("Cuentos para dormir {n}", "Varios", "Infantil"),
    ("Pack Manga Inicial {n}", "Varios", "Ofertas"),
]

COMENTARIOS = [
    "Lo compré la semana pasada y llegó impecable.",
    "El tomo tiene una edición muy cuidada.",
    "¿Alguien sabe si trae extras al final?",
    "Me encantó la historia, lo recomiendo.",
    "El envío fue rápido y bien embalado.",
    "Esperaba otra portada, pero igual está genial.",
]

HILOS = [
    ("¿Cuál es el mejor tomo para empezar One Piece?", "discussion"),
    ("Reseña: Naruto Vol. 1", "review"),
    ("Ranking de arcos de Jujutsu Kaisen", "discussion"),
    ("Reseña: Batman Año Uno", "review"),
    ("¿Manhwa o manga? Debatiendo gustos", "discussion"),
    ("Reseña: Solo Leveling Vol. 1", "review"),
    ("Coleccionables: ¿vale la pena?", "discussion"),
    ("Reseña: Artbook Ghibli 1", "review"),
    ("Recomendaciones de novelas ligeras", "discussion"),
    ("Reseña: Chainsaw Man Vol. 2", "review"),
    ("Fotos de nuestras colecciones", "discussion"),
    ("Reseña: Watchmen", "review"),
]


def _assert_local() -> None:
    """Evita sembrar datos de demo en Supabase por accidente."""
    destino = settings.database_url
    if "supabase" in destino or "pooler" in destino:
        raise SystemExit(
            "DATABASE_URL apunta a Supabase. El seed es solo para el PostgreSQL "
            "local: ejecútalo con DATABASE_URL vacía (POSTGRES_*)."
        )


def _reset(db) -> None:
    demo_users = db.query(User).filter(User.email.like(f"%{DEMO_DOMAIN}")).all()
    demo_ids = [u.id for u in demo_users]
    if demo_ids:
        db.query(ForumComment).filter(ForumComment.author_id.in_(demo_ids)).delete(
            synchronize_session=False
        )
        db.query(ForumPost).filter(ForumPost.author_id.in_(demo_ids)).delete(
            synchronize_session=False
        )
        db.query(Order).filter(Order.user_id.in_(demo_ids)).delete(
            synchronize_session=False
        )
        db.query(User).filter(User.id.in_(demo_ids)).delete(synchronize_session=False)

    db.query(Product).filter(Product.sku.like("DEMO-%")).delete(synchronize_session=False)
    db.commit()
    print("Datos de demostración eliminados.")


def seed() -> None:
    db = SessionLocal()
    random.seed(2026)
    try:
        if db.query(User).filter(User.email.like(f"%{DEMO_DOMAIN}")).first():
            print("El seed ya está aplicado (usa --reset para rehacerlo).")
            return

        # ── Categorías ──
        cats: dict[str, Category] = {}
        for nombre, slug, desc in CATEGORIAS:
            cat = (
                db.query(Category)
                .filter(or_(Category.slug == slug, Category.name == nombre))
                .first()
            )
            if not cat:
                cat = Category(name=nombre, slug=slug, description=desc)
                db.add(cat)
                db.flush()
            cats[nombre] = cat

        # ── Usuarios ──
        usuarios = []
        for i in range(1, 6):
            u = User(
                email=f"demo{i}{DEMO_DOMAIN}",
                username=f"demo{i}",
                hashed_password=hash_password(DEMO_PASSWORD),
                role=UserRole.CUSTOMER,
                is_active=True,
                is_verified=True,
                terms_accepted_at=datetime.now(timezone.utc),
                terms_version=settings.TERMS_VERSION,
            )
            db.add(u)
            usuarios.append(u)
        db.flush()

        # ── Productos ──
        productos: list[Product] = []
        n = 0
        for titulo, autor, cat in OBRAS:
            repeticiones = 3 if "{n}" in titulo else 1
            for variante in range(1, repeticiones + 1):
                n += 1
                nombre = titulo.format(n=variante)
                precio = Decimal(random.choice([4990, 6990, 7990, 8990, 9990, 12990, 14990]))
                stock = random.choice([0, 1, 2, 3, 5, 8, 12, 20])
                p = Product(
                    sku=f"DEMO-{n:03d}",
                    title=nombre,
                    author=autor,
                    publisher="Editorial Demo",
                    isbn=f"9780000{n:05d}",
                    description=f"Edición de demostración de «{nombre}».",
                    price=precio,
                    cover_url=None,
                    category_id=cats[cat].id,
                    is_active=True,
                )
                db.add(p)
                db.flush()
                db.add(Inventory(product_id=p.id, quantity=stock, reserved=0))
                productos.append(p)
        db.flush()

        # ── Hilos + comentarios ──
        for i, (titulo, tipo) in enumerate(HILOS):
            autor = usuarios[i % len(usuarios)]
            producto = None
            rating = None
            if tipo == "review":
                producto = productos[(i * 7) % len(productos)]
                rating = random.choice([4, 5, 5, 3])
            post = ForumPost(
                author_id=autor.id,
                title=titulo,
                body=(
                    "Comparto mi experiencia con este producto y quisiera leer "
                    "las suyas. ¡Gracias por pasar!"
                ),
                product_id=producto.id if producto else None,
                rating=rating,
                is_pinned=(i == 0),
            )
            db.add(post)
            db.flush()
            for j in range(random.randint(1, 3)):
                db.add(
                    ForumComment(
                        post_id=post.id,
                        author_id=usuarios[(i + j + 1) % len(usuarios)].id,
                        body=COMENTARIOS[(i + j) % len(COMENTARIOS)],
                    )
                )

        # ── Pedidos en todos los estados ──
        estados = [
            OrderStatus.PENDING,
            OrderStatus.PAID,
            OrderStatus.PAID,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
            OrderStatus.FAILED,
            OrderStatus.EXPIRED,
        ]
        for i, estado in enumerate(estados):
            user = usuarios[i % len(usuarios)]
            p = productos[(i * 3) % len(productos)]
            cantidad = 1
            subtotal = p.price * cantidad
            envio = Decimal(0) if subtotal >= settings.FREE_SHIPPING_FROM else Decimal(
                settings.SHIPPING_COST
            )
            creado = datetime.now(timezone.utc) - timedelta(days=len(estados) - i)
            order = Order(
                user_id=user.id,
                status=estado,
                subtotal=subtotal,
                shipping=envio,
                total=subtotal + envio,
                shipping_address="Av. Demo 1234, Santiago",
                shipping_name="Cliente Demo",
                shipping_phone="+56911111111",
                shipping_region="Metropolitana",
                shipping_comuna="Santiago",
                created_at=creado,
                expires_at=creado + timedelta(minutes=settings.STOCK_RESERVATION_MINUTES)
                if estado == OrderStatus.PENDING
                else None,
                paid_at=creado + timedelta(minutes=5)
                if estado in (OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED)
                else None,
            )
            db.add(order)
            db.flush()
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=p.id,
                    quantity=cantidad,
                    unit_price=p.price,
                )
            )

            # Ajusta el inventario para que los números cuadren.
            inv = db.get(Inventory, p.id)
            if estado == OrderStatus.PENDING:
                inv.quantity = max(inv.quantity - cantidad, 0)
                inv.reserved += cantidad
            elif estado in (
                OrderStatus.PAID,
                OrderStatus.SHIPPED,
                OrderStatus.DELIVERED,
            ):
                inv.quantity = max(inv.quantity - cantidad, 0)

        # ── Una reseña verificada por producto reseñado ──
        for post in db.query(ForumPost).filter(ForumPost.rating.is_not(None)).all():
            if not post.product_id:
                continue
            order = (
                db.query(Order)
                .filter(Order.user_id == post.author_id, Order.status == OrderStatus.PAID)
                .first()
            )
            if order:
                continue
            p = db.get(Product, post.product_id)
            if not p:
                continue
            nuevo = Order(
                user_id=post.author_id,
                status=OrderStatus.PAID,
                subtotal=p.price,
                shipping=settings.SHIPPING_COST,
                total=p.price + settings.SHIPPING_COST,
                shipping_address="Av. Demo 1234, Santiago",
                paid_at=datetime.now(timezone.utc),
            )
            db.add(nuevo)
            db.flush()
            db.add(
                OrderItem(
                    order_id=nuevo.id,
                    product_id=p.id,
                    quantity=1,
                    unit_price=p.price,
                )
            )

        db.commit()
        print(
            f"Seed listo: {len(CATEGORIAS)} categorías, {len(productos)} productos, "
            f"{len(usuarios)} usuarios (clave {DEMO_PASSWORD}), {len(HILOS)} hilos y "
            f"{len(estados)} pedidos."
        )
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Datos de demostración")
    parser.add_argument("--reset", action="store_true", help="Borra y vuelve a crear")
    args = parser.parse_args()

    _assert_local()
    if args.reset:
        db = SessionLocal()
        try:
            _reset(db)
        finally:
            db.close()
    seed()


if __name__ == "__main__":
    main()
