"""despacho, consentimiento de terminos y resena unica

Revision ID: b1a2c3d4e5f6
Revises: 6ba3f93994be
Create Date: 2026-10-24 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1a2c3d4e5f6"
down_revision: Union[str, None] = "6ba3f93994be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 2.6 Datos de despacho completos
    op.add_column("orders", sa.Column("shipping_name", sa.String(length=120), nullable=True))
    op.add_column("orders", sa.Column("shipping_phone", sa.String(length=30), nullable=True))
    op.add_column("orders", sa.Column("shipping_region", sa.String(length=80), nullable=True))
    op.add_column("orders", sa.Column("shipping_comuna", sa.String(length=80), nullable=True))

    # 3.2 Consentimiento de términos (Ley 19.496 / 21.719)
    op.add_column(
        "users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("terms_version", sa.String(length=20), nullable=True))

    # 1.2 Una sola reseña por usuario y producto
    op.create_index(
        "uq_forum_review_author_product",
        "forum_posts",
        ["author_id", "product_id"],
        unique=True,
        postgresql_where=sa.text("rating IS NOT NULL AND product_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_forum_review_author_product", table_name="forum_posts")
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("orders", "shipping_comuna")
    op.drop_column("orders", "shipping_region")
    op.drop_column("orders", "shipping_phone")
    op.drop_column("orders", "shipping_name")
