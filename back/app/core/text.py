"""Utilidades de texto compartidas."""

import re
import unicodedata


def slugify(value: str) -> str:
    """Convierte un texto a slug ASCII: 'Novela Gráfica' -> 'novela-grafica'."""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug or "sin-nombre"
