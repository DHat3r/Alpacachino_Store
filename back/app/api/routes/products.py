"""API routes for product catalog (public and admin)."""

import io
import uuid

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_admin
from app.core.config import settings
from app.core.text import slugify
from app.db.session import get_db
from app.models.forum import ForumPost
from app.models.product import Product, Category, Inventory
from app.schemas.product import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ProductCreate,
    ProductOut,
    ProductPage,
    ProductUpdate,
)

router = APIRouter(prefix="/products", tags=["catalog"])

ALLOWED_COVER_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _product_out(
    p: Product, rating_avg: float | None = None, reviews_count: int = 0
) -> ProductOut:
    inv = p.inventory
    return ProductOut(
        id=p.id,
        sku=p.sku,
        title=p.title,
        author=p.author,
        publisher=p.publisher,
        isbn=p.isbn,
        description=p.description,
        price=p.price,
        cover_url=p.cover_url,
        category_id=p.category_id,
        category=p.category,
        inventory_quantity=inv.quantity if inv else 0,
        inventory_reserved=inv.reserved if inv else 0,
        rating_avg=rating_avg,
        reviews_count=reviews_count,
        is_active=p.is_active,
        created_at=p.created_at,
    )


def _ratings_for(db: Session, product_ids: list[uuid.UUID]) -> dict:
    """Promedio y cantidad de reseñas visibles por producto (2.2)."""
    if not product_ids:
        return {}
    rows = (
        db.query(
            ForumPost.product_id,
            func.avg(ForumPost.rating),
            func.count(ForumPost.id),
        )
        .filter(
            ForumPost.product_id.in_(product_ids),
            ForumPost.rating.is_not(None),
            ForumPost.is_hidden.is_(False),
        )
        .group_by(ForumPost.product_id)
        .all()
    )
    return {pid: (float(avg) if avg is not None else None, count) for pid, avg, count in rows}


@router.get("", response_model=ProductPage)
def list_products(
    q: str | None = Query(None, max_length=80, description="Búsqueda por título/autor"),
    category: str | None = Query(None, description="Slug de categoría"),
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    in_stock: bool = False,
    sort: str = Query(
        "newest",
        pattern="^(newest|price_asc|price_desc|title)$",
        description="Orden del catálogo",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=48),
    db: Session = Depends(get_db),
):
    stmt = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.is_active.is_(True))
    )

    if q:
        like = f"%{q}%"
        stmt = stmt.filter(or_(Product.title.ilike(like), Product.author.ilike(like)))

    if category:
        stmt = stmt.join(Category).filter(Category.slug == category)

    if min_price is not None:
        stmt = stmt.filter(Product.price >= min_price)

    if max_price is not None:
        stmt = stmt.filter(Product.price <= max_price)

    if in_stock:
        stmt = stmt.join(Inventory).filter((Inventory.quantity - Inventory.reserved) > 0)

    order_by = {
        "newest": Product.created_at.desc(),
        "price_asc": Product.price.asc(),
        "price_desc": Product.price.desc(),
        "title": Product.title.asc(),
    }[sort]

    total = stmt.count()
    items = stmt.order_by(order_by).offset((page - 1) * size).limit(size).all()
    ratings = _ratings_for(db, [p.id for p in items])

    out_items = [
        _product_out(p, *ratings.get(p.id, (None, 0))) for p in items
    ]

    return ProductPage(items=out_items, total=total, page=page, size=size)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    include_inactive: bool = False, db: Session = Depends(get_db)
):
    stmt = db.query(Category)
    if not include_inactive:
        stmt = stmt.filter(Category.is_active.is_(True))
    return stmt.order_by(Category.name).all()


# ─── Admin: listado (incluye inactivos) — debe ir antes de /{sku_or_id} ───

@router.get("/admin", response_model=ProductPage)
def list_products_admin(
    q: str | None = Query(None, max_length=80),
    category: str | None = None,
    include_inactive: bool = True,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    stmt = db.query(Product).options(
        joinedload(Product.category), joinedload(Product.inventory)
    )
    if not include_inactive:
        stmt = stmt.filter(Product.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.filter(or_(Product.title.ilike(like), Product.sku.ilike(like)))
    if category:
        stmt = stmt.join(Category).filter(Category.slug == category)

    total = stmt.count()
    items = (
        stmt.order_by(Product.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    ratings = _ratings_for(db, [p.id for p in items])
    return ProductPage(
        items=[_product_out(p, *ratings.get(p.id, (None, 0))) for p in items],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{sku_or_id}", response_model=ProductOut)
def get_product(sku_or_id: str, db: Session = Depends(get_db)):
    # Try by UUID first, then by SKU
    try:
        product = (
            db.query(Product)
            .options(joinedload(Product.category), joinedload(Product.inventory))
            .filter(Product.id == uuid.UUID(sku_or_id))
            .first()
        )
    except ValueError:
        product = (
            db.query(Product)
            .options(joinedload(Product.category), joinedload(Product.inventory))
            .filter(Product.sku == sku_or_id)
            .first()
        )

    # Un producto desactivado deja de ser visible por su URL directa.
    if not product or not product.is_active:
        raise HTTPException(404, "Producto no encontrado")

    rating = _ratings_for(db, [product.id]).get(product.id, (None, 0))
    return _product_out(product, *rating)


# ─── Admin routes ───

@router.post("/admin", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    if db.query(Product).filter(Product.sku == payload.sku).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "El SKU ya existe")

    product = Product(**payload.model_dump(exclude={"stock"}))
    db.add(product)
    db.flush()

    db.add(Inventory(product_id=product.id, quantity=payload.stock))
    db.commit()
    db.refresh(product)

    return _product_out(product)


@router.patch("/admin/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise HTTPException(400, "ID inválido")

    product = db.get(Product, pid)
    if not product:
        raise HTTPException(404, "Producto no encontrado")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)

    rating = _ratings_for(db, [product.id]).get(product.id, (None, 0))
    return _product_out(product, *rating)


@router.delete("/admin/{product_id}", status_code=204)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise HTTPException(400, "ID inválido")

    product = db.get(Product, pid)
    if not product:
        raise HTTPException(404, "Producto no encontrado")

    # Soft delete
    product.is_active = False
    db.commit()


@router.post("/admin/{product_id}/cover", response_model=ProductOut)
async def upload_cover(
    product_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Sube la portada a Supabase Storage y guarda la URL pública (3.3)."""
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise HTTPException(400, "ID inválido")

    product = db.get(Product, pid)
    if not product:
        raise HTTPException(404, "Producto no encontrado")

    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise HTTPException(
            503,
            "Supabase Storage no está configurado: faltan SUPABASE_URL y "
            "SUPABASE_SECRET_KEY (la secret key actual devuelve 401).",
        )

    if file.content_type not in ALLOWED_COVER_TYPES:
        raise HTTPException(400, "Formato no permitido: usa JPG, PNG o WebP")

    raw = await file.read()
    limit = settings.MAX_COVER_MB * 1024 * 1024
    if len(raw) > limit:
        raise HTTPException(400, f"La imagen supera {settings.MAX_COVER_MB} MB")

    # Convertir a WebP (mismo tamaño, mejor compresión).
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw)).convert("RGB")
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=85)
        webp = out.getvalue()
    except Exception:
        raise HTTPException(400, "No se pudo procesar la imagen")

    bucket = settings.SUPABASE_STORAGE_BUCKET
    path = f"{product.sku}-{uuid.uuid4().hex[:8]}.webp"
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{path}"

    try:
        response = httpx.post(
            url,
            content=webp,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}",
                "Content-Type": "image/webp",
                "x-upsert": "true",
            },
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No se pudo subir la imagen: {exc}")

    if response.status_code not in (200, 201):
        raise HTTPException(
            502, f"Supabase Storage respondió {response.status_code}"
        )

    product.cover_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"
    db.commit()
    db.refresh(product)

    rating = _ratings_for(db, [product.id]).get(product.id, (None, 0))
    return _product_out(product, *rating)


@router.post("/admin/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    slug = slugify(payload.name)
    if db.query(Category).filter(Category.slug == slug).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "La categoría ya existe")

    category = Category(name=payload.name, slug=slug, description=payload.description)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/admin/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Categoría no encontrada")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != category.name:
        new_slug = slugify(data["name"])
        if (
            db.query(Category)
            .filter(Category.slug == new_slug, Category.id != category.id)
            .first()
        ):
            raise HTTPException(409, "Ya existe una categoría con ese nombre")
        category.slug = new_slug

    for key, value in data.items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)
    return category


@router.delete("/admin/categories/{category_id}", status_code=204)
def delete_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Categoría no encontrada")
    category.is_active = False
    db.commit()
