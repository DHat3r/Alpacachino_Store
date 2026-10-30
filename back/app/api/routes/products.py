"""API routes for the public product catalog (read only)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.product import Product, Category, Inventory
from app.schemas.product import CategoryOut, ProductOut, ProductPage

router = APIRouter(prefix="/products", tags=["catalog"])


def _product_out(p: Product) -> ProductOut:
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
        is_active=p.is_active,
        created_at=p.created_at,
    )


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
        stmt = stmt.join(Inventory).filter(Inventory.quantity > 0)

    order_by = {
        "newest": Product.created_at.desc(),
        "price_asc": Product.price.asc(),
        "price_desc": Product.price.desc(),
        "title": Product.title.asc(),
    }[sort]

    total = stmt.count()
    items = stmt.order_by(order_by).offset((page - 1) * size).limit(size).all()

    return ProductPage(
        items=[_product_out(p) for p in items], total=total, page=page, size=size
    )


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    include_inactive: bool = False, db: Session = Depends(get_db)
):
    stmt = db.query(Category)
    if not include_inactive:
        stmt = stmt.filter(Category.is_active.is_(True))
    return stmt.order_by(Category.name).all()


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

    return _product_out(product)
