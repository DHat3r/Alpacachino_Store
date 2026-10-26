"""Pruebas de los cambios previos al frontend (CAMBIOS_ANTES_DEL_FRONTEND.md)."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment
from app.models.product import Inventory, Product
from app.models.user import User


@pytest.fixture(autouse=True)
def fake_payment(monkeypatch):
    """Evita llamadas reales a MercadoPago/Webpay."""
    monkeypatch.setattr(
        "app.api.routes.orders.create_payment_preference",
        lambda order: {"init_point": "https://sandbox.pago.test/123", "external_id": "ext-123"},
    )


def _checkout(client: TestClient, headers: dict, product: Product, qty: int = 1, **extra):
    payload = {
        "items": [{"product_id": str(product.id), "quantity": qty}],
        "shipping_address": "Av. Siempre Viva 742, Santiago",
    }
    payload.update(extra)
    return client.post("/api/orders/checkout", headers=headers, json=payload)


def _paid_order(db, user: User, product: Product) -> Order:
    order = Order(
        user_id=user.id,
        status=OrderStatus.PAID,
        subtotal=product.price,
        shipping=0,
        total=product.price,
    )
    db.add(order)
    db.flush()
    db.add(
        OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=1,
            unit_price=product.price,
        )
    )
    db.commit()
    return order


# ─── 1.1 Transiciones de pedido y stock ───


def test_admin_paga_consolida_reserva_y_crea_pago(
    client: TestClient, auth_headers, admin_headers, product_factory, db
):
    product = product_factory(stock=10)
    order_id = _checkout(client, auth_headers, product).json()["order_id"]

    res = client.patch(
        f"/api/orders/admin/{order_id}/status",
        params={"new_status": "paid"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "paid"
    assert res.json()["paid_at"] is not None

    db.expire_all()
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 9
    assert inv.reserved == 0
    pago = db.query(Payment).filter(Payment.order_id == order_id).one()
    assert pago.provider == "manual"
    assert pago.status == "approved"


def test_transicion_invalida_409(
    client: TestClient, auth_headers, admin_headers, product_factory, db
):
    product = product_factory(stock=10)
    order_id = _checkout(client, auth_headers, product).json()["order_id"]

    res = client.patch(
        f"/api/orders/admin/{order_id}/status",
        params={"new_status": "delivered"},
        headers=admin_headers,
    )
    assert res.status_code == 409


def test_pendiente_cancelado_devuelve_stock(
    client: TestClient, auth_headers, admin_headers, product_factory, db
):
    product = product_factory(stock=10)
    order_id = _checkout(client, auth_headers, product, qty=2).json()["order_id"]

    res = client.patch(
        f"/api/orders/admin/{order_id}/status",
        params={"new_status": "cancelled"},
        headers=admin_headers,
    )
    assert res.status_code == 200

    db.expire_all()
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 10
    assert inv.reserved == 0


def test_pagado_cancelado_repone_stock(
    client: TestClient, auth_headers, admin_headers, product_factory, db
):
    product = product_factory(stock=10)
    order_id = _checkout(client, auth_headers, product, qty=2).json()["order_id"]

    client.patch(
        f"/api/orders/admin/{order_id}/status",
        params={"new_status": "paid"},
        headers=admin_headers,
    )
    res = client.patch(
        f"/api/orders/admin/{order_id}/status",
        params={"new_status": "cancelled"},
        headers=admin_headers,
    )
    assert res.status_code == 200

    db.expire_all()
    inv = db.get(Inventory, product.id)
    assert inv.quantity == 10  # repuestas las 2 unidades vendidas


def test_detalle_pedido_trae_titulo_y_portada(
    client: TestClient, auth_headers, product_factory
):
    product = product_factory(title="One Piece Vol. 1")
    order_id = _checkout(client, auth_headers, product).json()["order_id"]

    detalle = client.get(f"/api/orders/{order_id}", headers=auth_headers).json()
    item = detalle["items"][0]
    assert item["title"] == "One Piece Vol. 1"
    assert item["sku"] == "MANGA-001"
    assert "cover_url" in item
    assert detalle["items"][0]["quantity"] == 1


def test_cliente_cancela_su_pedido_pendiente(
    client: TestClient, auth_headers, product_factory, db
):
    product = product_factory(stock=5)
    order_id = _checkout(client, auth_headers, product).json()["order_id"]

    res = client.post(f"/api/orders/{order_id}/cancel", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"

    db.expire_all()
    assert db.get(Inventory, product.id).quantity == 5

    # Ya no se puede cancelar dos veces
    assert (
        client.post(f"/api/orders/{order_id}/cancel", headers=auth_headers).status_code
        == 409
    )


def test_checkout_manual_devuelve_instrucciones(
    client: TestClient, auth_headers, product_factory, monkeypatch
):
    product = product_factory(stock=5)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "manual")
    monkeypatch.setattr(
        "app.api.routes.orders.create_payment_preference",
        lambda order: {
            "init_point": None,
            "external_id": None,
            "instructions": settings.manual_payment_instructions,
        },
    )

    res = _checkout(client, auth_headers, product)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["payment_provider"] == "manual"
    assert data["payment_url"] is None
    assert data["payment_instructions"]["provider"] == "manual"


def _expiracion(client: TestClient, headers: dict, order_id: int) -> timedelta:
    order = client.get(f"/api/orders/{order_id}", headers=headers).json()
    expires = datetime.fromisoformat(order["expires_at"].replace("Z", "+00:00"))
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires - datetime.now(timezone.utc)


def test_reserva_con_pago_manual_dura_24_horas(
    client: TestClient, auth_headers, product_factory, monkeypatch
):
    """La reserva debe durar lo que se le promete al cliente para transferir."""
    product = product_factory(stock=5)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "manual")
    monkeypatch.setattr(settings, "MANUAL_PAYMENT_HOURS", 24)

    res = _checkout(client, auth_headers, product)
    assert res.status_code == 201, res.text

    restante = _expiracion(client, auth_headers, res.json()["order_id"])
    assert timedelta(hours=23, minutes=55) < restante <= timedelta(hours=24)


def test_reserva_con_pasarela_en_linea_sigue_siendo_corta(
    client: TestClient, auth_headers, product_factory, monkeypatch
):
    product = product_factory(stock=5)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "mercadopago")
    monkeypatch.setattr(settings, "STOCK_RESERVATION_MINUTES", 15)

    res = _checkout(client, auth_headers, product)
    assert res.status_code == 201, res.text

    restante = _expiracion(client, auth_headers, res.json()["order_id"])
    assert timedelta(minutes=14) < restante <= timedelta(minutes=15)


def test_factory_manual_sin_pasarela(monkeypatch):
    from app.services.payments.factory import create_payment_preference

    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "manual")
    resultado = create_payment_preference(None)
    assert resultado["init_point"] is None
    assert resultado["instructions"]["provider"] == "manual"


# ─── 1.2 Validaciones de reseñas ───


def test_resena_sin_producto_422(client: TestClient, auth_headers):
    res = client.post(
        "/api/forum/posts",
        json={
            "title": "Reseña sin producto",
            "body": "Este cuerpo es suficientemente largo.",
            "rating": 5,
        },
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_resena_producto_inexistente_404(client: TestClient, auth_headers):
    res = client.post(
        "/api/forum/posts",
        json={
            "title": "Reseña fantasma",
            "body": "Este cuerpo es suficientemente largo.",
            "rating": 5,
            "product_id": str(uuid.uuid4()),
        },
        headers=auth_headers,
    )
    assert res.status_code == 404


def test_resena_duplicada_409(
    client: TestClient, auth_headers, product_factory, customer, db
):
    product = product_factory()
    _paid_order(db, customer, product)

    payload = {
        "title": "Mi reseña",
        "body": "Este cuerpo es suficientemente largo.",
        "rating": 5,
        "product_id": str(product.id),
    }
    assert client.post("/api/forum/posts", json=payload, headers=auth_headers).status_code == 201
    assert client.post("/api/forum/posts", json=payload, headers=auth_headers).status_code == 409


# ─── 1.3 / 2.3 Foro: ocultos, filtros y producto embebido ───


def test_hilo_oculto_404_publico_pero_visible_moderacion(
    client: TestClient, auth_headers, moderator_headers
):
    post = client.post(
        "/api/forum/posts",
        json={"title": "Hilo oculto", "body": "Cuerpo suficientemente largo."},
        headers=auth_headers,
    ).json()

    client.patch(
        f"/api/forum/admin/posts/{post['id']}/hide",
        params={"hide": True},
        headers=moderator_headers,
    )

    assert client.get(f"/api/forum/posts/{post['id']}").status_code == 404
    assert (
        client.get(
            f"/api/forum/posts/{post['id']}/comments", headers=auth_headers
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/forum/posts/{post['id']}", headers=moderator_headers
        ).status_code
        == 200
    )


def test_filtros_y_producto_embebido(
    client: TestClient, auth_headers, product_factory, customer, db
):
    product = product_factory(title="One Piece Vol. 7", stock=5)
    _paid_order(db, customer, product)

    client.post(
        "/api/forum/posts",
        json={
            "title": "Reseña del tomo",
            "body": "Cuerpo suficientemente largo para la reseña.",
            "rating": 4,
            "product_id": str(product.id),
        },
        headers=auth_headers,
    )
    client.post(
        "/api/forum/posts",
        json={"title": "Charla general", "body": "Cuerpo suficientemente largo."},
        headers=auth_headers,
    )

    reviews = client.get("/api/forum/posts", params={"kind": "review"}).json()
    assert reviews["total"] == 1
    assert reviews["items"][0]["product"]["sku"] == "MANGA-001"

    discusiones = client.get("/api/forum/posts", params={"kind": "discussion"}).json()
    assert discusiones["total"] == 1

    busqueda = client.get("/api/forum/posts", params={"q": "Charla"}).json()
    assert busqueda["total"] == 1
    assert busqueda["items"][0]["title"] == "Charla general"


def test_producto_expone_promedio_de_resenas(
    client: TestClient, auth_headers, product_factory, customer, db
):
    product = product_factory(stock=5)
    _paid_order(db, customer, product)
    client.post(
        "/api/forum/posts",
        json={
            "title": "Muy bueno",
            "body": "Cuerpo suficientemente largo para la reseña.",
            "rating": 4,
            "product_id": str(product.id),
        },
        headers=auth_headers,
    )

    detalle = client.get(f"/api/products/{product.id}").json()
    assert detalle["rating_avg"] == 4.0
    assert detalle["reviews_count"] == 1

    listado = client.get("/api/products", params={"sort": "title"}).json()
    assert listado["items"][0]["reviews_count"] == 1


# ─── 2.4 Comentarios propios, reportes, pin/lock ───


def test_comentario_editar_y_borrar_propio(client: TestClient, auth_headers):
    post = client.post(
        "/api/forum/posts",
        json={"title": "Hilo", "body": "Cuerpo suficientemente largo."},
        headers=auth_headers,
    ).json()
    comment = client.post(
        f"/api/forum/posts/{post['id']}/comments",
        json={"body": "Comentario original"},
        headers=auth_headers,
    ).json()

    editado = client.patch(
        f"/api/forum/comments/{comment['id']}",
        json={"body": "Comentario corregido"},
        headers=auth_headers,
    )
    assert editado.status_code == 200
    assert editado.json()["body"] == "Comentario corregido"

    assert (
        client.delete(f"/api/forum/comments/{comment['id']}", headers=auth_headers).status_code
        == 204
    )
    assert client.get(f"/api/forum/posts/{post['id']}/comments").json() == []


def test_comentario_ajeno_prohibido(
    client: TestClient, auth_headers, user_factory
):
    from app.core.security import create_access_token

    post = client.post(
        "/api/forum/posts",
        json={"title": "Hilo", "body": "Cuerpo suficientemente largo."},
        headers=auth_headers,
    ).json()
    comment = client.post(
        f"/api/forum/posts/{post['id']}/comments",
        json={"body": "Comentario"},
        headers=auth_headers,
    ).json()

    otro = user_factory(email="otro@test.cl", username="otro")
    headers = {"Authorization": f"Bearer {create_access_token(otro.id, otro.role.value)}"}

    assert (
        client.patch(
            f"/api/forum/comments/{comment['id']}",
            json={"body": "Intento"},
            headers=headers,
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/api/forum/comments/{comment['id']}", headers=headers).status_code
        == 403
    )


def test_reportar_comentario_y_contexto_en_moderacion(
    client: TestClient, auth_headers, moderator_headers
):
    post = client.post(
        "/api/forum/posts",
        json={"title": "Hilo reportado", "body": "Cuerpo suficientemente largo."},
        headers=auth_headers,
    ).json()
    comment = client.post(
        f"/api/forum/posts/{post['id']}/comments",
        json={"body": "Comentario ofensivo"},
        headers=auth_headers,
    ).json()

    assert (
        client.post(
            f"/api/forum/comments/{comment['id']}/report",
            json={"reason": "Lenguaje ofensivo"},
            headers=auth_headers,
        ).status_code
        == 201
    )

    reportes = client.get("/api/forum/admin/reports", headers=moderator_headers).json()
    assert reportes["total"] == 1
    item = reportes["items"][0]
    assert item["comment_body"] == "Comentario ofensivo"
    assert item["post_title"] == "Hilo reportado"
    assert item["reporter_username"] == "cliente"

    resuelto = client.patch(
        f"/api/forum/admin/reports/{item['id']}/resolve", headers=moderator_headers
    )
    assert resuelto.status_code == 200
    pendientes = client.get(
        "/api/forum/admin/reports", params={"resolved": False}, headers=moderator_headers
    ).json()
    assert pendientes["total"] == 0


def test_pin_y_lock(client: TestClient, auth_headers, moderator_headers):
    post = client.post(
        "/api/forum/posts",
        json={"title": "Hilo fijado", "body": "Cuerpo suficientemente largo."},
        headers=auth_headers,
    ).json()

    assert (
        client.patch(
            f"/api/forum/admin/posts/{post['id']}/pin",
            params={"pinned": True},
            headers=moderator_headers,
        ).json()["is_pinned"]
        is True
    )
    client.patch(
        f"/api/forum/admin/posts/{post['id']}/lock",
        params={"locked": True},
        headers=moderator_headers,
    )

    res = client.post(
        f"/api/forum/posts/{post['id']}/comments",
        json={"body": "No debería entrar"},
        headers=auth_headers,
    )
    assert res.status_code == 403


# ─── 2.6 / 2.7 / 3.2 Autenticación y perfil ───


def _register_payload(**overrides) -> dict:
    payload = {
        "email": "nuevo@test.cl",
        "username": "nuevo",
        "password": "Clave1234",
        "accept_terms": True,
    }
    payload.update(overrides)
    return payload


def test_registro_exige_aceptar_terminos(client: TestClient):
    res = client.post("/api/auth/register", json=_register_payload(accept_terms=False))
    assert res.status_code == 422


def test_registro_guarda_aceptacion(client: TestClient):
    res = client.post("/api/auth/register", json=_register_payload())
    assert res.status_code == 201, res.text
    assert res.json()["terms_accepted_at"] is not None


def test_refresh_token_en_body(client: TestClient, customer):
    login = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    ).json()

    res = client.post(
        "/api/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_cambiar_username_y_password(client: TestClient, auth_headers, customer):
    res = client.patch(
        "/api/auth/me", json={"username": "cliente_nuevo"}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["username"] == "cliente_nuevo"

    malo = client.post(
        "/api/auth/change-password",
        json={"current_password": "Incorrecta1", "new_password": "Nueva1234"},
        headers=auth_headers,
    )
    assert malo.status_code == 400

    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": "Clave1234", "new_password": "Nueva1234"},
        headers=auth_headers,
    )
    assert ok.status_code == 204

    login = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Nueva1234"},
    )
    assert login.status_code == 200


def test_eliminar_cuenta_anonimiza(client: TestClient, auth_headers, customer, db):
    assert client.delete("/api/auth/me", headers=auth_headers).status_code == 204

    db.expire_all()
    user = db.get(User, customer.id)
    assert user.email.startswith("eliminado+")
    assert user.username == f"usuario_eliminado_{customer.id}"
    assert user.is_active is False

    login = client.post(
        "/api/auth/login",
        data={"username": customer.email, "password": "Clave1234"},
    )
    assert login.status_code == 401


# ─── 2.8 Configuración pública ───


def test_config_publica(client: TestClient):
    data = client.get("/api/config").json()
    assert data["shipping_cost"] == settings.SHIPPING_COST
    assert data["free_shipping_from"] == settings.FREE_SHIPPING_FROM
    assert data["reservation_minutes"] == settings.reservation_minutes
    assert data["seller"]["name"]
    assert data["payment_provider"] in {"mercadopago", "webpay", "manual"}


def test_config_publica_reserva_depende_del_medio_de_pago(
    client: TestClient, monkeypatch
):
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "mercadopago")
    assert (
        client.get("/api/config").json()["reservation_minutes"]
        == settings.STOCK_RESERVATION_MINUTES
    )

    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "manual")
    monkeypatch.setattr(settings, "MANUAL_PAYMENT_HOURS", 24)
    data = client.get("/api/config").json()
    assert data["reservation_minutes"] == 24 * 60
    assert data["payment_instructions"]["deadline_hours"] == 24


# ─── 3.4 Admin: productos inactivos y categorías ───


def test_listado_admin_incluye_inactivos(
    client: TestClient, admin_headers, product_factory
):
    product_factory(sku="VISIBLE-1", is_active=True)
    inactivo = product_factory(sku="OCULTO-1", title="Oculto", is_active=False)

    publico = client.get("/api/products").json()
    assert publico["total"] == 1

    admin = client.get("/api/products/admin", headers=admin_headers).json()
    assert admin["total"] == 2
    assert any(p["id"] == str(inactivo.id) for p in admin["items"])


def test_editar_y_desactivar_categoria(client: TestClient, admin_headers):
    creada = client.post(
        "/api/products/admin/categories",
        json={"name": "Terror", "description": "Historias de miedo"},
        headers=admin_headers,
    )
    assert creada.status_code == 201, creada.text
    cat = creada.json()

    editada = client.patch(
        f"/api/products/admin/categories/{cat['id']}",
        json={"name": "Terror y suspenso"},
        headers=admin_headers,
    )
    assert editada.status_code == 200
    assert editada.json()["slug"] == "terror-y-suspenso"

    assert (
        client.delete(
            f"/api/products/admin/categories/{cat['id']}", headers=admin_headers
        ).status_code
        == 204
    )
    activas = client.get("/api/products/categories").json()
    assert all(c["id"] != cat["id"] for c in activas)


def test_subida_portada_sin_storage_503(
    client: TestClient, admin_headers, product_factory, monkeypatch
):
    product = product_factory()
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "")

    res = client.post(
        f"/api/products/admin/{product.id}/cover",
        files={"file": ("portada.png", b"contenido", "image/png")},
        headers=admin_headers,
    )
    assert res.status_code == 503


def test_subida_portada_formato_invalido_400(
    client: TestClient, admin_headers, product_factory, monkeypatch
):
    product = product_factory()
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "fake")

    res = client.post(
        f"/api/products/admin/{product.id}/cover",
        files={"file": ("portada.txt", b"contenido", "text/plain")},
        headers=admin_headers,
    )
    assert res.status_code == 400


def test_producto_desactivado_responde_404_por_sku(client: TestClient, product_factory):
    product_factory(sku="ACTIVO-1", is_active=True)
    product_factory(sku="INACTIVO-1", is_active=False)

    assert client.get("/api/products/ACTIVO-1").status_code == 200
    assert client.get("/api/products/INACTIVO-1").status_code == 404
