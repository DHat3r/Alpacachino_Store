"""API routes for product catalog (public and admin)."""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import or_, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_admin
from app.core.text import slugify
from app.db.session import get_db
from app.models.product import Product, Category, Inventory
from app.schemas.product import ProductOut, ProductPage, ProductCreate, ProductUpdate, CategoryCreate, CategoryOut

router = APIRouter(prefix="/products", tags=["catalog"])


@router.get("", response_model=ProductPage)
def list_products(
    q: str | None = Query(None, max_length=80, description="Búsqueda por título/autor"),
    category: str | None = Query(None, description="Slug de categoría"),
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    in_stock: bool = False,
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

    total = stmt.count()
    items = stmt.order_by(Product.created_at.desc()).offset((page - 1) * size).limit(size).all()

    # Transform to include inventory data
    out_items = []
    for p in items:
        inv = p.inventory
        out_items.append(ProductOut(
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
        ))

    return ProductPage(items=out_items, total=total, page=page, size=size)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).filter(Category.is_active.is_(True)).order_by(Category.name).all()


@router.get("/{sku_or_id}", response_model=ProductOut)
def get_product(sku_or_id: str, db: Session = Depends(get_db)):
    # Try by UUID first, then by SKU
    product = None
    try:
        import uuid
        product = db.query(Product).options(
            joinedload(Product.category), joinedload(Product.inventory)
        ).filter(Product.id == uuid.UUID(sku_or_id)).first()
    except ValueError:
        product = db.query(Product).options(
            joinedload(Product.category), joinedload(Product.inventory)
        ).filter(Product.sku == sku_or_id).first()

    if not product:
        raise HTTPException(404, "Producto no encontrado")

    inv = product.inventory
    return ProductOut(
        id=product.id,
        sku=product.sku,
        title=product.title,
        author=product.author,
        publisher=product.publisher,
        isbn=product.isbn,
        description=product.description,
        price=product.price,
        cover_url=product.cover_url,
        category_id=product.category_id,
        category=product.category,
        inventory_quantity=inv.quantity if inv else 0,
        inventory_reserved=inv.reserved if inv else 0,
        is_active=product.is_active,
        created_at=product.created_at,
    )


# ─── Admin routes ───

@router.post("/admin", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    # Check SKU uniqueness
    if db.query(Product).filter(Product.sku == payload.sku).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "El SKU ya existe")

    product = Product(**payload.model_dump(exclude={"stock"}))
    db.add(product)
    db.flush()

    db.add(Inventory(product_id=product.id, quantity=payload.stock))
    db.commit()
    db.refresh(product)

    inv = product.inventory
    return ProductOut(
        id=product.id,
        sku=product.sku,
        title=product.title,
        author=product.author,
        publisher=product.publisher,
        isbn=product.isbn,
        description=product.description,
        price=product.price,
        cover_url=product.cover_url,
        category_id=product.category_id,
        category=product.category,
        inventory_quantity=inv.quantity if inv else 0,
        inventory_reserved=inv.reserved if inv else 0,
        is_active=product.is_active,
        created_at=product.created_at,
    )


@router.patch("/admin/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    import uuid
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

    inv = product.inventory
    return ProductOut(
        id=product.id,
        sku=product.sku,
        title=product.title,
        author=product.author,
        publisher=product.publisher,
        isbn=product.isbn,
        description=product.description,
        price=product.price,
        cover_url=product.cover_url,
        category_id=product.category_id,
        category=product.category,
        inventory_quantity=inv.quantity if inv else 0,
        inventory_reserved=inv.reserved if inv else 0,
        is_active=product.is_active,
        created_at=product.created_at,
    )


@router.delete("/admin/{product_id}", status_code=204)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    import uuid
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