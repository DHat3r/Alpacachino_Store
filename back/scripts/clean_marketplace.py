"""Limpia el catálogo extraído de Facebook Marketplace para ``import_catalog.py``.

El Excel de origen tiene una fila por publicación con las columnas
``Título del Manga``, ``Editorial``, ``Tomo / Volumen``, ``Condición`` y
``Precio (CLP)``, pero viene sucio: columnas corridas, el texto del aviso
pegado en el título, filas con todo en una sola celda y precios como "$10.000".

Genera un Excel con dos hojas:

- ``importar``: el formato de ``import_catalog.py`` (sku, titulo, autor,
  editorial, descripcion, precio, stock, categoria). Cada publicación es un
  producto con stock 1: se vende el lote tal como se publicó.
- ``revisar``: cada fila de origen con lo que se hizo y lo que conviene mirar.

Uso:
    python scripts/clean_marketplace.py --file catalogo.xlsx --out catalogo_limpio.xlsx
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

# Permite `python scripts/clean_marketplace.py` desde /app (sys.path[0] es scripts/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from app.core.text import slugify

COLS = ["Título del Manga", "Editorial", "Tomo / Volumen", "Condición", "Precio (CLP)"]

# ── Correcciones de nombres ──────────────────────────────────

TITULOS = {
    "Assasination Classroom": "Assassination Classroom",
    "Fairy Tale": "Fairy Tail",
    "Khemono Jihen": "Kemono Jihen",
    "Frankestein": "Frankenstein",
    "Undescovery Country": "Undiscovered Country",
    "Magic Knight Rayeart": "Magic Knight Rayearth",
    "Los deseosobsesivosdemichico": "Los deseos obsesivos de mi chico",
    "Sun Ken-Rock": "Sun Ken Rock",
    "Dr stone": "Dr. Stone",
    "Dr Stone": "Dr. Stone",
    "Ladron de ladrones": "Ladrón de ladrones",
    "weathering with you": "Weathering With You",
    "Kaguya Sama": "Kaguya-sama",
    "Komi-San": "Komi-san",
    "Jojos Bizarre Adventure Parte I": "JoJo's Bizarre Adventure Parte I",
    "JoJo Bizarre Adventure Part I Phantom Blood": "JoJo's Bizarre Adventure Parte I: Phantom Blood",
    "Dragon Ball Super Heroes Dark Demond Realm mission": "Dragon Ball Super Heroes: Dark Demon Realm Mission",
    "Blade of the inmortal": "Blade of the Immortal",
    "My hero academia": "My Hero Academia",
    "No me jodas nagaroto": "No me jodas, Nagatoro",
    "Battle Royal Edicion Deluxe": "Battle Royale Edición Deluxe",
    "Sakura Cardcaptor Edicion Deluxe": "Sakura Card Captor Edición Deluxe",
    "Country & Queen Edicion Definitiva": "Queen & Country Edición Definitiva",
    "La vida y la epoca de Andy Warhol": "La vida y la época de Andy Warhol",
    "Reverberacion": "Reverberación",
    "Hitorijime my hero": "Hitorijime My Hero",
    "Aoha ride": "Ao Haru Ride",
    "Something is killing the children": "Something Is Killing the Children",
    "The nice house on the lake": "The Nice House on the Lake",
    "One week friends": "One Week Friends",
    "To your Eternity": "To Your Eternity",
    "Shuumatsu no valkyrie": "Shuumatsu no Valkyrie",
    "Locke and Key": "Locke & Key",
    "Last Gunnm Order": "Gunnm: Last Order",
    "Last Gunnm Order Battle angel alita": "Battle Angel Alita: Last Order",
    "Los 12 nacimientos de miguel marmol": "Los 12 nacimientos de Miguel Mármol",
    "Transmetropolitan Tapa dura": "Transmetropolitan (tapa dura)",
    "Ídolo una historia casi real": "Ídolo: una historia casi real",
    "Requiem por el rey de la rosa": "Réquiem por el rey de la rosa",
    "Harley Quinn Preludios y chistes malos": "Harley Quinn: Preludios y chistes malos",
    "Ex porque todo tiene que terminar": "Ex: porque todo tiene que terminar",
    "La torre oscura integral": "La torre oscura (integral)",
    "Blue period": "Blue Period",
    "Oshi no ko": "Oshi no Ko",
    "Red room": "Red Room",
}

EDITORIALES = {
    "ecc": "ECC",
    "panini esp": "Panini Esp",
    "planeta de agostini": "Planeta DeAgostini",
    "grijalbo": "Grijalbo",
    "ivrea arg": "Ivrea Arg",
}

# ── Categorías ───────────────────────────────────────────────
# Por editorial, con excepciones por título. Lo dudoso queda marcado en «revisar».

EDITORIALES_MANGA = {
    "Ivrea", "Ivrea Arg", "Ivrea Esp", "Panini Arg", "Panini Mex", "Panini Esp",
    "Distrito Manga", "Milky Way", "Ovni", "Larp", "Satori Manga", "Tomodomo",
    "Pop Fiction", "Ponent Mon",
}

MANGA = {
    "Naruto", "Ciudades y mansiones encantadas", "Estudio desde el abismo del terror",
    "Frankenstein", "Hikizuri y Oshikiri", "Naturaleza Desbocada", "Death Note",
    "Guardianes de la noche", "Historias Cortas de Koyoharu Gotouge", "Sekisei Inko",
    "Tokyo Revengers", "Una enfermedad llamada amor", "20 Century Boys", "Basilisk",
    "Fenix", "Gunsmith Cats", "One Piece", "One Week Friends", "Fragmentos del mal",
}

MANHWA = {"Solo Leveling", "A Returner’s Magic Should be Special"}

DUDOSOS = {
    "El umbral de lo siniestro", "Isla de perros", "El monstruo de color de rosa",
    "Gichi Gichi Kid", "Un tren llamado amor", "Duam", "Sex Warrior", "Reverberación",
    "The Shadow", "Taxi", "Alabaster", "Durmiente", "Capullo Rojo",
    'Los "rollos" de la celulitis',
}

# ── Filas con todo en el título ──────────────────────────────
# Clave: el título tal cual viene. Valor: (título, editorial, tomos, autor, categoría,
# nota) o None para dejarla fuera del catálogo.

MANUAL: dict[str, tuple | None] = {
    "Batman Caballero Oscuro III La Raza Superior ECC Tomos 2 y 3":
        ("Batman: El Caballero Oscuro III – La Raza Superior", "ECC", "2-3", "Frank Miller", "Cómic", ""),
    "Chainsaw Man Ivrea Arg Tomos 4 y 8(x4) (regalo 3 pirata)":
        ("Chainsaw Man", "Ivrea Arg", "4-8(x4)", "Tatsuki Fujimoto", "Manga",
         "Incluye de regalo un tomo 3 no oficial. Revisar el precio: 5.000 por 5 tomos."),
    "Claymore 1 al 17 Norma 18 al 20 Panini Mex":
        ("Claymore", "Norma / Panini Mex", "1 al 17 (Norma) y 18 al 20 (Panini Mex)", "Norihiro Yagi", "Manga", ""),
    "El Dios Rata": ("El Dios Rata", "", "", "Richard Corben", "Cómic", "Sin editorial ni tomos."),
    "Enciclopedias Salvat": None,
    "Fragmentos del mal ECC Junji Ito Tomo unico":
        ("Fragmentos del mal", "ECC", "Tomo unico", "Junji Ito", "Manga", ""),
    "I am a Hero Coleccion":
        ("I Am a Hero", "", "Colección", "Kengo Hanazawa", "Manga", "No indica editorial ni qué tomos incluye."),
    "JUEGOS DE MESA!!! Y OTROS": None,
    "Justicia Alex Ross Tomo unico ECC": ("Justicia", "ECC", "Tomo unico", "Alex Ross", "Cómic", ""),
    "Kingdom Tomos Ivrea Esp 2(x2)-3 e Ivrea Arg 4-5-7":
        ("Kingdom", "Ivrea Esp / Ivrea Arg", "Tomos 2 (×2) y 3 (Ivrea Esp); 4, 5 y 7 (Ivrea Arg)", "Yasuhisa Hara", "Manga", ""),
    "Master Keaton Planeta Naoki Urasawa":
        ("Master Keaton", "Planeta", "", "Naoki Urasawa", "Manga", "No indica qué tomos incluye."),
    "Neko Wappa! IVREA ARG Tomo unico": ("Neko Wappa!", "Ivrea Arg", "Tomo unico", "", "Manga", ""),
    "Origin Boichi Panini Mex Tomo 1": ("Origin", "Panini Mex", "1", "Boichi", "Manga", ""),
    "Origin Panini España Completa": ("Origin", "Panini Esp", "Completa", "Boichi", "Manga", ""),
    "Puerto estelar George R. R. Martin":
        ("Puerto estelar", "", "", "George R. R. Martin", "Cómic", "Sin editorial ni tomos."),
    "Star Slammers Completa Panini España":
        ("Star Slammers", "Panini Esp", "Completa", "Walter Simonson", "Cómic", ""),
    "Takagi Ivrea Arg Tomo 2": ("Karakai Jouzu no Takagi-san", "Ivrea Arg", "2", "Sōichirō Yamamoto", "Manga", ""),
    "Taxi Integral Norma": ("Taxi", "Norma", "Integral", "", "Cómic", ""),
    "Tekkonkinkreet ALL IN ONE ECC Nuevo":
        ("Tekkonkinkreet All in One", "ECC", "Tomo unico", "Taiyō Matsumoto", "Manga", ""),
    "Undead Unluck Primer tomo Ivrea Arg": ("Undead Unluck", "Ivrea Arg", "1", "Yoshifumi Tozuka", "Manga", ""),
    "Venezuela Cronicas de Ángel Satre Planeta Tomo unico":
        ("Venezuela: crónicas de Ángel Satre", "Planeta", "Tomo unico", "", "Cómic", ""),
    "We Stand On Guard": ("We Stand On Guard", "", "", "Brian K. Vaughan", "Cómic", "Sin editorial ni tomos."),
    "Wytches + Especial Bad Egg":
        ("Wytches", "", "Tomo único + especial Bad Egg", "Scott Snyder", "Cómic", "Sin editorial."),
    "en japones! Originales 4000 c/u todos por 10000!": None,
}

# Las condiciones y los precios que no cuadran se anotan para revisarlos a mano.
CONDICION_PRECIO = re.compile(r"^\d[\d.]*\s+ambos$", re.IGNORECASE)
PARECE_TOMO = re.compile(r"^(tomo\s*)?[\d\s\-–,;al+()x×]+$", re.IGNORECASE)


def _texto(valor) -> str:
    return "" if pd.isna(valor) else str(valor).strip()


def _precio(texto: str) -> int:
    digitos = re.sub(r"[^\d]", "", texto)
    return int(digitos) if digitos else 0


def _editorial(texto: str) -> str:
    return EDITORIALES.get(texto.lower(), texto)


def _titulo(texto: str) -> str:
    texto = re.sub(r"\s+", " ", texto).strip()
    texto = TITULOS.get(texto, texto)
    return texto[:1].upper() + texto[1:]


def _tomos(texto: str) -> tuple[str, int]:
    """Devuelve el texto para el cliente y cuántos tomos se reconocieron (0 = no se sabe)."""
    t = re.sub(r"\s+", " ", texto).strip()
    bajo = t.lower()
    if not t:
        return "", 0
    if bajo in {"tomo unico", "tomo único"}:
        return "Tomo único", 1
    if bajo in {"completa", "completo", "serie completa"}:
        return "Colección completa", 0
    if bajo.startswith("completa +"):
        return f"Colección completa + {t.split('+', 1)[1].strip()}", 0
    if bajo == "integral":
        return "Edición integral", 1

    m = re.fullmatch(r"(\d+)\s*al\s*(\d+)(.*)", t, re.IGNORECASE)
    if m:
        resto = m.group(3).strip()
        texto_ = f"Tomos {m.group(1)} al {m.group(2)}" + (f" {resto}" if resto else "")
        return texto_, int(m.group(2)) - int(m.group(1)) + 1

    sin_tomo = re.sub(r"^tomo\s*", "", t, flags=re.IGNORECASE)
    principal, _, extra = sin_tomo.partition("+")
    if re.fullmatch(r"[\d\s\-;()x×]+", principal):
        partes = [p.strip() for p in re.split(r"[-;]", principal) if p.strip()]
        legibles = [re.sub(r"\s*\(\s*[x×]\s*(\d+)\s*\)", r" (×\1)", p) for p in partes]
        etiqueta = "Tomo" if len(legibles) == 1 else "Tomos"
        lista = ", ".join(legibles)
        texto_ = f"{etiqueta} {lista}" + (f" + {extra.strip()}" if extra.strip() else "")
        return texto_, len(legibles)

    return t[:1].upper() + t[1:], 0


def _condicion(texto: str) -> str:
    bajo = texto.lower().strip()
    if not bajo or bajo == "no especificado":
        return ""
    if "sellad" in bajo:
        return "Sellados"
    if bajo in {"nuevo", "nuevos"}:
        return "Nuevo"
    if bajo in {"como nuevo", "como nuevos", "usado - como nuevo"}:
        return "Como nuevo"
    if bajo in {"buen estado", "usado - buen estado"}:
        return "Buen estado"
    return texto[:1].upper() + texto[1:]


def _categoria(titulo: str, editorial: str) -> str:
    if titulo in MANHWA:
        return "Manhwa"
    if titulo in MANGA:
        return "Manga"
    return "Manga" if editorial in EDITORIALES_MANGA else "Cómic"


def _sku(titulo: str, editorial: str, tomos: str, precio: int) -> str:
    clave = f"{titulo}|{editorial}|{tomos}|{precio}".lower()
    huella = hashlib.sha1(clave.encode("utf-8")).hexdigest()[:4].upper()
    return f"MP-{slugify(titulo)[:24].strip('-').upper()}-{huella}"


def limpiar(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    importar, revisar = [], []

    for idx, fila in df.iterrows():
        bruto = [_texto(fila[c]) for c in COLS]
        a, b, c, d, precio_txt = bruto
        notas: list[str] = []
        autor = ""
        categoria = None

        if a in MANUAL:
            entrada = MANUAL[a]
            if entrada is None:
                revisar.append({"fila": idx + 2, "original": a, "accion": "Excluida",
                                "notas": "No es un cómic o no tiene datos suficientes."})
                continue
            titulo, editorial, tomos_txt, autor, categoria, nota = entrada
            condicion = _condicion(d)
            if nota:
                notas.append(nota)
            notas.append("Separada a mano: venía todo en el título.")
        elif a.startswith("[") or "\n" in a:
            # Texto del aviso pegado: el título real es la última línea de la columna B.
            titulo = b.splitlines()[-1].strip()
            editorial = c
            if PARECE_TOMO.match(d) or d.lower() in {"completa", "tomo unico", "tomo único"} or "+" in d:
                tomos_txt, condicion = d, ""
            else:
                tomos_txt, condicion = "", _condicion(d)
            notas.append("Se quitó el texto del aviso de Marketplace.")
        else:
            titulo, editorial, tomos_txt, condicion = a, b, c, d
            if PARECE_TOMO.match(editorial) and not PARECE_TOMO.match(tomos_txt):
                editorial, tomos_txt = tomos_txt, editorial
                notas.append("Editorial y tomo venían invertidos.")
            if CONDICION_PRECIO.match(condicion):
                notas.append(
                    f"La condición dice «{condicion}» pero el precio publicado es "
                    f"{_precio(precio_txt):,}. Revisar el precio.".replace(",", ".")
                )
                condicion = ""
            else:
                condicion = _condicion(condicion)

        titulo = _titulo(titulo)
        editorial = _editorial(editorial)
        tomos, n_tomos = _tomos(tomos_txt)
        precio = _precio(precio_txt)
        categoria = categoria or _categoria(titulo, editorial)

        if titulo in DUDOSOS:
            notas.append(f"Categoría «{categoria}» a confirmar.")
        if precio <= 0:
            notas.append("Sin precio: el importador la va a omitir.")
        if not tomos and a not in MANUAL:
            notas.append("No indica tomos.")

        nombre = titulo if tomos in {"", "Tomo único"} else f"{titulo} — {tomos}"

        detalle = []
        if editorial:
            detalle.append(f"Editorial: {editorial}.")
        if tomos:
            detalle.append(f"{tomos}.")
        if condicion:
            detalle.append(f"Estado: {condicion}.")
        if n_tomos != 1 and tomos:
            detalle.append("Se vende el lote completo.")

        sku = _sku(titulo, editorial, tomos, precio)
        importar.append({
            "sku": sku,
            "titulo": nombre[:200],
            "autor": autor,
            "editorial": editorial,
            "descripcion": " ".join(detalle),
            "precio": precio,
            "stock": 1,
            "categoria": categoria,
        })
        revisar.append({
            "fila": idx + 2,
            "original": " | ".join(x.replace("\n", " ⏎ ") for x in bruto if x)[:300],
            "accion": "Importar",
            "sku": sku,
            "titulo": nombre,
            "categoria": categoria,
            "precio": precio,
            "notas": " ".join(notas),
        })

    salida = pd.DataFrame(importar)
    repetidos = salida[salida.duplicated("sku", keep=False)]
    if not repetidos.empty:
        sys.exit(f"SKU repetidos, revisa estas filas:\n{repetidos.to_string()}")
    return salida, pd.DataFrame(revisar)


def main() -> None:
    parser = argparse.ArgumentParser(description="Limpia el catálogo de Marketplace")
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    df = pd.read_excel(args.file, dtype=str)
    faltan = [c for c in COLS if c not in df.columns]
    if faltan:
        sys.exit(f"Faltan columnas: {', '.join(faltan)}")

    importar, revisar = limpiar(df)
    with pd.ExcelWriter(args.out, engine="openpyxl") as xls:
        importar.to_excel(xls, sheet_name="importar", index=False)
        revisar.to_excel(xls, sheet_name="revisar", index=False)
        anchos = {"importar": [26, 60, 22, 22, 70, 10, 7, 12], "revisar": [6, 80, 10, 26, 60, 12, 10, 80]}
        for hoja, cols in anchos.items():
            for i, ancho in enumerate(cols):
                xls.sheets[hoja].column_dimensions[chr(65 + i)].width = ancho

    excluidas = (revisar["accion"] == "Excluida").sum()
    con_notas = (revisar["notas"].fillna("").str.len() > 0).sum()
    print(f"[OK] {len(importar)} productos listos, {excluidas} excluidas, {con_notas} filas con notas → {args.out}")


if __name__ == "__main__":
    main()
