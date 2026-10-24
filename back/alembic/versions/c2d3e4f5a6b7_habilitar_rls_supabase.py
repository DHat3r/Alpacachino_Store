"""habilitar RLS en el esquema public (Supabase)

Revision ID: c2d3e4f5a6b7
Revises: b1a2c3d4e5f6
Create Date: 2026-10-24 22:00:00.000000

Contexto: Supabase expone el esquema ``public`` por su API REST (PostgREST). Con
RLS desactivado, cualquiera que tenga la clave publicable (anon) puede leer y
escribir todas las tablas, incluida ``users`` con los hashes de contraseña.

La aplicación NO usa esa API: se conecta directo a PostgreSQL con el rol
``postgres``, que es dueño de las tablas y por eso ignora RLS. Activar RLS sin
crear políticas deja las tablas cerradas para ``anon`` y ``authenticated`` y no
afecta a la aplicación.

Es idempotente y segura en un PostgreSQL local o de CI: los roles ``anon`` y
``authenticated`` solo existen en Supabase, y el dueño de la tabla siempre
ignora RLS.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1a2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE = """
DO $$
DECLARE
    t record;
    r text;
BEGIN
    -- 1. RLS en todas las tablas del esquema public (incluida alembic_version).
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(t.tablename)
                || ' ENABLE ROW LEVEL SECURITY';
    END LOOP;

    -- 2. Defensa en profundidad: quitar permisos a los roles de la API de Supabase,
    --    ahora y para las tablas que se creen en el futuro.
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ' || quote_ident(r);
            EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ' || quote_ident(r);
            EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ' || quote_ident(r);
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM '
                    || quote_ident(r);
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM '
                    || quote_ident(r);
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM '
                    || quote_ident(r);
        END IF;
    END LOOP;
END
$$;
"""

_DOWNGRADE = """
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(t.tablename)
                || ' DISABLE ROW LEVEL SECURITY';
    END LOOP;
END
$$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE)


def downgrade() -> None:
    # Solo desactiva RLS; no devuelve permisos a anon/authenticated a propósito.
    op.execute(_DOWNGRADE)
