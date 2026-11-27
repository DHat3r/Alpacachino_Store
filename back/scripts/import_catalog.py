"""Excel import script with validation, dry-run, and idempotency."""

import argparse
import re
import sys
from decimal import Decimal
from pathlib import Path

# Permite `python scripts/import_catalog.py` desde /app (sys.path[0] es scripts/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from sqlalchemy import select

from app.core.text import slugify
from app.db.session import SessionLocal
from app.models.product import Product, Category, Inventory


REQUIRED_COLS = {"sku", "titulo", "precio", "stock"}


def load_dataframe(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, dtype=str).fillna("")
    df.columns = [c.strip().lower() for c in df.columns]
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        sys.exit(f"Faltan columnas obligatorias: {', '.join(sorted(missing))}")
    return df


def _category(db, name: str) -> Category:
    """Busca la categoría por nombre o por slug; si no existe, la crea."""
    name = name.strip()
    category = db.scalar(
        select(Category).where(
            (Category.name == name) | (Category.slug == slugify(name))
        )
    )
    if not category:
        category = Category(name=name, slug=slugify(name))
        db.add(category)
        db.flush()
    return category


def run(path: Path, dry_run: bool, limit: int | None = None) -> None:
    df = load_dataframe(path)
    db = SessionLocal()
    created = updated = skipped = errors = 0

    try:
        for idx, row in df.iterrows():
            if limit and idx >= limit:
                break

            sku = str(row["sku"]).strip()
            try:
                # Acepta "12990", "12.990" o "$12.990" (CLP no tiene decimales).
                price = Decimal(re.sub(r"[^\d]", "", str(row["precio"])) or "0")
                stock = int(float(row["stock"] or 0))
            except (ValueError, ArithmeticError):
                print(f"[ERROR] fila {idx + 2}: precio/stock inválido → {sku}")
                errors += 1
                continue

            if not sku or price <= 0:
                print(f"[SKIP] fila {idx + 2}: SKU vacío o precio 0")
                skipped += 1
                continue

            category = _category(db, row.get("categoria") or "General")
            product = db.scalar(select(Product).where(Product.sku == sku))
            if product:
                product.title = row["titulo"] or product.title
                product.price = price
                product.author = row.get("autor") or product.author
                product.publisher = row.get("editorial") or product.publisher
                product.description = row.get("descripcion") or product.description
                product.category_id = category.id
                if product.inventory:
                    # «stock» es lo que hay en bodega; quantity excluye lo reservado.
                    product.inventory.quantity = max(stock - product.inventory.reserved, 0)
                updated += 1
            else:
                product = Product(
                    sku=sku,
                    title=row["titulo"],
                    author=row.get("autor") or None,
                    publisher=row.get("editorial") or None,
                    description=row.get("descripcion") or None,
                    price=price,
                    category_id=category.id,
                )
                db.add(product)
                db.flush()
                db.add(Inventory(product_id=product.id, quantity=stock))
                created += 1

        if dry_run:
            db.rollback()
            print(
                f"[DRY-RUN] se revertiría todo → crear={created}, actualizar={updated}, "
                f"omitir={skipped}, errores={errors}"
            )
        else:
            db.commit()
            print(f"[OK] crear={created}, actualizar={updated}, omitir={skipped}, errores={errors}")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa el catálogo Excel a PostgreSQL")
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    run(args.file, args.dry_run, args.limit)