"""Pruebas del foro comunitario (RF-06, RF-07)."""

from fastapi.testclient import TestClient

from app.models.order import Order, OrderItem, OrderStatus


def _post_payload(**overrides) -> dict:
    payload = {
        "title": "Mi reseña de One Piece",
        "body": "Un manga increíble que recomiendo totalmente.",
    }
    payload.update(overrides)
    return payload


def test_listar_posts_publico(client: TestClient):
    res = client.get("/api/forum/posts")
    assert res.status_code == 200
    assert res.json() == []


def test_crear_post_requiere_login(client: TestClient):
    assert client.post("/api/forum/posts", json=_post_payload()).status_code == 401


def test_crear_post_y_listarlo(client: TestClient, auth_headers, customer):
    res = client.post("/api/forum/posts", json=_post_payload(), headers=auth_headers)
    assert res.status_code == 201, res.text
    post = res.json()
    assert post["author_username"] == customer.username
    assert post["comments_count"] == 0

    lista = client.get("/api/forum/posts")
    assert lista.json()[0]["title"] == "Mi reseña de One Piece"


def test_titulo_muy_corto_rechazado(client: TestClient, auth_headers):
    res = client.post(
        "/api/forum/posts", json=_post_payload(title="ab"), headers=auth_headers
    )
    assert res.status_code == 422


def test_comentar_y_listar_comentarios(client: TestClient, auth_headers, customer):
    post = client.post("/api/forum/posts", json=_post_payload(), headers=auth_headers).json()

    res = client.post(
        f"/api/forum/posts/{post['id']}/comments",
        json={"body": "Coincido, es excelente."},
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert res.json()["author_username"] == customer.username

    comments = client.get(f"/api/forum/posts/{post['id']}/comments")
    assert comments.status_code == 200
    assert len(comments.json()) == 1
    assert comments.json()[0]["body"] == "Coincido, es excelente."


def test_comentar_post_inexistente(client: TestClient, auth_headers):
    res = client.post(
        "/api/forum/posts/999/comments", json={"body": "hola"}, headers=auth_headers
    )
    assert res.status_code == 404


def test_resena_sin_compra_rechazada(
    client: TestClient, auth_headers, product_factory
):
    product = product_factory()
    res = client.post(
        "/api/forum/posts",
        json=_post_payload(rating=5, product_id=str(product.id)),
        headers=auth_headers,
    )
    assert res.status_code == 403


def test_resena_con_compra_aprobada(
    client: TestClient, auth_headers, product_factory, customer, db
):
    product = product_factory()
    order = Order(
        user_id=customer.id,
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

    res = client.post(
        "/api/forum/posts",
        json=_post_payload(rating=5, product_id=str(product.id)),
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert res.json()["rating"] == 5


def test_editar_post_ajeno_prohibido(
    client: TestClient, auth_headers, product_factory, user_factory, db
):
    from app.core.security import create_access_token

    post = client.post("/api/forum/posts", json=_post_payload(), headers=auth_headers).json()

    other = user_factory(email="intruso@test.cl", username="intruso")
    headers = {
        "Authorization": f"Bearer {create_access_token(other.id, other.role.value)}"
    }
    res = client.patch(
        f"/api/forum/posts/{post['id']}", json={"title": "Hackeado"}, headers=headers
    )
    assert res.status_code == 403


def test_autor_edita_y_borra_su_post(client: TestClient, auth_headers):
    post = client.post("/api/forum/posts", json=_post_payload(), headers=auth_headers).json()

    res = client.patch(
        f"/api/forum/posts/{post['id']}",
        json={"title": "Título corregido"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Título corregido"

    borrado = client.delete(f"/api/forum/posts/{post['id']}", headers=auth_headers)
    assert borrado.status_code == 204

    # Soft delete: no aparece en el listado público
    assert client.get("/api/forum/posts").json() == []


def test_reportar_post_y_no_duplicar(client: TestClient, auth_headers):
    post = client.post("/api/forum/posts", json=_post_payload(), headers=auth_headers).json()

    first = client.post(
        f"/api/forum/posts/{post['id']}/report",
        json={"reason": "Contenido ofensivo"},
        headers=auth_headers,
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/forum/posts/{post['id']}/report",
        json={"reason": "Spam repetido de prueba"},
        headers=auth_headers,
    )
    assert second.status_code == 409


def test_moderador_oculta_post(
    client: TestClient, auth_headers, moderator_headers
):
    post = client.post("/api/forum/posts", json=_post_payload(), headers=auth_headers).json()

    res = client.patch(
        f"/api/forum/admin/posts/{post['id']}/hide",
        params={"hide": True},
        headers=moderator_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_hidden"] is True
    assert client.get("/api/forum/posts").json() == []


def test_cliente_no_puede_moderar(client: TestClient, auth_headers):
    res = client.get("/api/forum/admin/reports", headers=auth_headers)
    assert res.status_code == 403
