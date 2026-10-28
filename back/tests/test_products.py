"""Pruebas del catálogo: búsqueda, filtros, CRUD y control de acceso (RF-01, RF-02)."""

from fastapi.testclient import TestClient


def test_listado_vacio(client: TestClient):
    res = client.get("/api/products")
    assert res.status_code == 200
    assert res.json() == {"items": [], "total": 0, "page": 1, "size": 12}


def test_listado_y_stock_disponible(client: TestClient, product_factory):
    product_factory(stock=10, reserved=3, sku="MANGA-001")
    res = client.get("/api/products")
    assert res.status_code == 200
    item = res.json()["items"][0]
    assert item["sku"] == "MANGA-001"
    assert item["inventory_quantity"] == 10
    assert item["inventory_reserved"] == 3
    # quantity ya excluye lo reservado: el disponible es quantity, no quantity - reserved.
    assert item["available_stock"] == 10


def test_busqueda_por_titulo_y_autor(client: TestClient, product_factory):
    product_factory(sku="MANGA-001", title="One Piece Vol. 1")
    product_factory(sku="MANGA-002", title="Naruto Vol. 1")

    res = client.get("/api/products", params={"q": "naruto"})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["sku"] == "MANGA-002"

    res = client.get("/api/products", params={"q": "Autor de prueba"})
    assert res.json()["total"] == 2


def test_filtro_por_categoria(client: TestClient, product_factory, db):
    from app.models.product import Category

    comic = Category(name="Cómic", slug="comic")
    db.add(comic)
    db.commit()

    product_factory(sku="MANGA-001", title="One Piece")
    product_factory(sku="COMIC-001", title="Batman", category=comic)

    res = client.get("/api/products", params={"category": "comic"})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["sku"] == "COMIC-001"


def test_filtro_por_precio(client: TestClient, product_factory):
    product_factory(sku="BARATO", price=5000)
    product_factory(sku="CARO", price=20000)

    res = client.get("/api/products", params={"min_price": 10000})
    assert [i["sku"] for i in res.json()["items"]] == ["CARO"]

    res = client.get("/api/products", params={"max_price": 10000})
    assert [i["sku"] for i in res.json()["items"]] == ["BARATO"]


def test_filtro_solo_con_stock(client: TestClient, product_factory):
    product_factory(sku="CON-STOCK", stock=5)
    product_factory(sku="AGOTADO", stock=0, reserved=2)

    res = client.get("/api/products", params={"in_stock": True})
    assert [i["sku"] for i in res.json()["items"]] == ["CON-STOCK"]


def test_paginacion(client: TestClient, product_factory):
    for i in range(5):
        product_factory(sku=f"SKU-{i:03d}", title=f"Producto {i}")

    res = client.get("/api/products", params={"page": 2, "size": 2})
    body = res.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["page"] == 2


def test_detalle_por_sku_y_por_uuid(client: TestClient, product_factory):
    product = product_factory(sku="MANGA-001")

    by_sku = client.get("/api/products/MANGA-001")
    assert by_sku.status_code == 200
    assert by_sku.json()["id"] == str(product.id)

    by_id = client.get(f"/api/products/{product.id}")
    assert by_id.status_code == 200
    assert by_id.json()["sku"] == "MANGA-001"


def test_detalle_inexistente(client: TestClient):
    assert client.get("/api/products/NO-EXISTE").status_code == 404


def test_categorias_publicas(client: TestClient, product_factory):
    product_factory()
    res = client.get("/api/products/categories")
    assert res.status_code == 200
    assert res.json()[0]["slug"] == "manga"


def test_crear_producto_requiere_admin(client: TestClient, auth_headers):
    payload = {
        "sku": "NUEVO-001",
        "title": "Producto nuevo",
        "price": 9990,
        "stock": 4,
    }
    res = client.post("/api/products/admin", json=payload, headers=auth_headers)
    assert res.status_code == 403


def test_admin_crea_producto_y_categoria(client: TestClient, admin_headers):
    cat = client.post(
        "/api/products/admin/categories",
        json={"name": "Novela Gráfica", "description": "Novelas gráficas"},
        headers=admin_headers,
    )
    assert cat.status_code == 201
    category_id = cat.json()["id"]
    assert cat.json()["slug"] == "novela-grafica"

    res = client.post(
        "/api/products/admin",
        json={
            "sku": "NOV-001",
            "title": "Persépolis",
            "price": 25990,
            "stock": 3,
            "category_id": category_id,
        },
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["sku"] == "NOV-001"
    assert body["inventory_quantity"] == 3
    assert body["available_stock"] == 3


def test_admin_sku_duplicado(client: TestClient, admin_headers, product_factory):
    product_factory(sku="DUP-001")
    res = client.post(
        "/api/products/admin",
        json={"sku": "DUP-001", "title": "Otro", "price": 1000, "stock": 1},
        headers=admin_headers,
    )
    assert res.status_code == 409


def test_admin_actualiza_y_borra_logicamente(client: TestClient, admin_headers, product_factory, db):
    product = product_factory(sku="EDIT-001", title="Original")

    res = client.patch(
        f"/api/products/admin/{product.id}",
        json={"title": "Actualizado", "price": 12345},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Actualizado"
    assert res.json()["price"] == "12345"

    res = client.delete(f"/api/products/admin/{product.id}", headers=admin_headers)
    assert res.status_code == 204

    db.expire_all()
    from app.models.product import Product

    assert db.get(Product, product.id).is_active is False

    # Ya no aparece en el catálogo público
    assert client.get("/api/products").json()["total"] == 0
