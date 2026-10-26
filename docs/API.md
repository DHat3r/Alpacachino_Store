# Referencia de la API — AlpacachinoStore

Todas las rutas cuelgan de `/api`. En local: `http://localhost:8001/api`.
La documentación interactiva (Swagger) está en `/docs` y solo existe con `DEBUG=true`.

## Índice

1. [Convenciones](#1-convenciones)
2. [Autenticación y perfil](#2-autenticación-y-perfil) — `/auth`
3. [Catálogo](#3-catálogo) — `/products`
4. [Pedidos y checkout](#4-pedidos-y-checkout) — `/orders`
5. [Foro](#5-foro) — `/forum`
6. [Panel de administración](#6-panel-de-administración) — `/admin`
7. [Configuración y salud](#7-configuración-y-salud)
8. [Pagos y webhooks](#8-pagos-y-webhooks)
9. [Modelos de datos](#9-modelos-de-datos)

---

## 1. Convenciones

### Autenticación

Las rutas protegidas piden la cabecera:

```
Authorization: Bearer <access_token>
```

El `access_token` dura 30 minutos y el `refresh_token` 7 días (configurable).

En la columna **Acceso** de las tablas:

| Valor | Significa |
|---|---|
| Público | No requiere sesión |
| Opcional | Funciona sin sesión; con sesión de staff muestra contenido oculto |
| Usuario | Cualquier sesión válida |
| Moderador | Rol `moderator` o `admin` |
| Admin | Rol `admin` |

### Errores

Los errores usan el formato de FastAPI:

```json
{ "detail": "Mensaje en español" }
```

Los errores de validación (`422`) traen `detail` como una lista:

```json
{
  "detail": [
    { "loc": ["body", "password"], "msg": "Value error, La contraseña debe contener al menos un número", "type": "value_error" }
  ]
}
```

| Código | Cuándo |
|---|---|
| `400` | Dato mal formado (UUID inválido, imagen ilegible, contraseña actual incorrecta) |
| `401` | Falta el token, está vencido o es inválido; credenciales incorrectas |
| `403` | Sesión válida pero sin permiso (rol, o regla de negocio) |
| `404` | Recurso inexistente (o invisible para ese usuario) |
| `409` | Conflicto: duplicado, stock insuficiente, transición de estado inválida |
| `422` | Falló la validación del cuerpo o de los parámetros |
| `429` | Límite de tasa superado |
| `502` / `503` | Falla de un servicio externo (Supabase Storage no configurado o caído) |

### Límites de tasa (por IP)

| Ruta | Límite |
|---|---|
| `POST /auth/register` | 5 / minuto |
| `POST /auth/login` | 10 / minuto |
| `POST /forum/posts` | 10 / minuto |
| `POST /forum/posts/{id}/comments` | 20 / minuto |

### Paginación

Los listados devuelven:

```json
{ "items": [ ... ], "total": 48, "page": 1, "size": 12 }
```

`page` empieza en 1. Cada ruta indica su `size` por defecto y su máximo.

### Tipos

- Los precios son **pesos chilenos (CLP)** y llegan como número/decimal sin separadores.
- Los `id` de producto y categoría son **UUID**; los de usuario, pedido, publicación y
  comentario son **enteros**.
- Las fechas son ISO 8601 en UTC.

---

## 2. Autenticación y perfil

Prefijo: `/api/auth`

| Método | Ruta | Acceso | Resumen |
|---|---|---|---|
| POST | `/auth/register` | Público | Crea una cuenta de cliente |
| POST | `/auth/login` | Público | Entrega el par de tokens |
| POST | `/auth/refresh` | Público (con refresh token) | Renueva el par de tokens |
| GET | `/auth/me` | Usuario | Perfil de la sesión |
| PATCH | `/auth/me` | Usuario | Cambia el nombre de usuario |
| POST | `/auth/change-password` | Usuario | Cambia la contraseña |
| DELETE | `/auth/me` | Usuario | Anonimiza la cuenta |

### `POST /auth/register`

Cuerpo (JSON):

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Correo válido; se guarda en minúsculas |
| `username` | string | 3–50 caracteres; solo letras, números, `_` y `-`; se guarda en minúsculas |
| `password` | string | 8–100 caracteres, con al menos una mayúscula, una minúscula y un número |
| `accept_terms` | boolean | Debe ser `true` (términos y privacidad) |

Respuesta `201` — `UserOut`:

```json
{
  "id": 7,
  "email": "ana@correo.cl",
  "username": "ana",
  "role": "customer",
  "is_active": true,
  "is_verified": false,
  "created_at": "2026-10-26T15:00:00Z",
  "terms_accepted_at": "2026-10-26T15:00:00Z"
}
```

Errores: `409` si el correo o el usuario ya existen; `422` si falla alguna regla;
`429` si se superan 5 intentos por minuto. Siempre se crea con rol `customer`, y se guarda la
versión de los términos aceptada (`TERMS_VERSION`).

### `POST /auth/login`

> Atención: el cuerpo es **`application/x-www-form-urlencoded`** (estándar OAuth2), no JSON.
> El campo `username` lleva el **correo**.

```
username=ana@correo.cl&password=Clave1234
```

Respuesta `200` — `TokenPair`:

```json
{ "access_token": "eyJ…", "refresh_token": "eyJ…", "token_type": "bearer" }
```

Errores: `401` credenciales incorrectas; `403` cuenta desactivada; `429` más de 10 por minuto.
Actualiza `last_login`.

### `POST /auth/refresh`

Cuerpo (JSON), recomendado:

```json
{ "refresh_token": "eyJ…" }
```

Por compatibilidad también acepta `?token=<refresh_token>` en la URL (evítalo: los tokens en
URLs quedan en los registros). Respuesta `200`: un `TokenPair` nuevo.
Errores: `401` token inválido, de tipo incorrecto o usuario inactivo; `422` si falta el token.

### `GET /auth/me`

Devuelve el `UserOut` de la sesión.

### `PATCH /auth/me`

```json
{ "username": "ana_lee" }
```

Mismas reglas que en el registro (3–50, letras/números/`_`/`-`). Respuesta `200` con el
`UserOut` actualizado. `409` si el nombre ya está en uso.

### `POST /auth/change-password`

```json
{ "current_password": "Clave1234", "new_password": "OtraClave99" }
```

La nueva contraseña cumple las mismas reglas de complejidad. Respuesta `204` sin cuerpo.
`400` si la actual no coincide o si la nueva es igual a la actual.

### `DELETE /auth/me`

Anonimiza la cuenta (Ley 21.719): el correo pasa a `eliminado+<id>@invalid.local`, el usuario a
`usuario_eliminado_<id>`, la contraseña se reemplaza por una aleatoria y la cuenta queda inactiva.
**No** borra la fila, porque los pedidos deben conservarse por obligación tributaria; el contenido
del foro queda a nombre del usuario anonimizado. Respuesta `204`.

---

## 3. Catálogo

Prefijo: `/api/products`

| Método | Ruta | Acceso | Resumen |
|---|---|---|---|
| GET | `/products` | Público | Lista paginada con filtros |
| GET | `/products/categories` | Público | Categorías |
| GET | `/products/{sku_or_id}` | Público | Detalle por SKU o UUID |
| GET | `/products/admin` | Admin | Lista que incluye inactivos |
| POST | `/products/admin` | Admin | Crea un producto |
| PATCH | `/products/admin/{product_id}` | Admin | Edita un producto |
| DELETE | `/products/admin/{product_id}` | Admin | Desactiva un producto |
| POST | `/products/admin/{product_id}/cover` | Admin | Sube la portada |
| POST | `/products/admin/categories` | Admin | Crea una categoría |
| PATCH | `/products/admin/categories/{category_id}` | Admin | Edita una categoría |
| DELETE | `/products/admin/categories/{category_id}` | Admin | Desactiva una categoría |

### `GET /products`

Parámetros de consulta:

| Parámetro | Tipo | Defecto | Descripción |
|---|---|---|---|
| `q` | string (máx. 80) | — | Busca en título y autor (sin distinguir mayúsculas) |
| `category` | string | — | **Slug** de la categoría (no el id) |
| `min_price` / `max_price` | int ≥ 0 | — | Rango de precio |
| `in_stock` | boolean | `false` | Solo productos con stock disponible |
| `sort` | `newest` \| `price_asc` \| `price_desc` \| `title` | `newest` | Orden |
| `page` | int ≥ 1 | 1 | Página |
| `size` | int 1–48 | 12 | Tamaño de página |

Solo aparecen productos activos. Respuesta: `ProductPage`.

```json
{
  "items": [
    {
      "id": "0b9f…",
      "sku": "DEMO-001",
      "title": "Berserk 1",
      "author": "Kentaro Miura",
      "publisher": "Panini",
      "isbn": null,
      "description": "…",
      "price": "12990",
      "cover_url": null,
      "category_id": "5c1e…",
      "category": { "id": "5c1e…", "name": "Seinen", "slug": "seinen", "description": null, "is_active": true },
      "inventory_quantity": 10,
      "inventory_reserved": 2,
      "available_stock": 8,
      "rating_avg": 4.5,
      "reviews_count": 2,
      "is_active": true,
      "created_at": "2026-10-20T12:00:00Z"
    }
  ],
  "total": 48, "page": 1, "size": 12
}
```

Cómo leer el stock: `inventory_quantity` es lo que queda en bodega **después** de las
reservas, `inventory_reserved` lo apartado en pedidos pendientes, y `available_stock`
(calculado) es lo que realmente se puede comprar. `rating_avg` y `reviews_count` salen de las
reseñas visibles del foro; `rating_avg` es `null` si no hay reseñas.

### `GET /products/categories`

Parámetro: `include_inactive` (boolean, defecto `false`). Devuelve una lista de
`CategoryOut` ordenada por nombre.

### `GET /products/{sku_or_id}`

Acepta el UUID o el SKU. Respuesta: un `ProductOut`. `404` si no existe.
Un producto desactivado responde `404`.

### `POST /products/admin`

Cuerpo (`ProductCreate`):

| Campo | Tipo | Reglas |
|---|---|---|
| `sku` | string | 1–40, único |
| `title` | string | 1–200 |
| `author`, `publisher` | string | máx. 120, opcional |
| `isbn` | string | máx. 20, opcional |
| `description` | string | opcional |
| `price` | decimal | ≥ 0 |
| `cover_url` | string | máx. 500, opcional |
| `category_id` | UUID | opcional |
| `stock` | int | ≥ 0, defecto 0; crea la fila de inventario |

Respuesta `201` con el `ProductOut`. `409` si el SKU ya existe.

### `PATCH /products/admin/{product_id}`

Cuerpo parcial (`ProductUpdate`): `title`, `author`, `publisher`, `isbn`, `description`, `price`,
`cover_url`, `category_id`, `is_active`. Solo se cambian los campos enviados. **El SKU y el stock
no se editan aquí** (el stock se ajusta en `/admin/inventory/{product_id}`).
`400` si el id no es UUID; `404` si no existe.

### `DELETE /products/admin/{product_id}`

Borrado lógico: pone `is_active=false`. Respuesta `204`. Para reactivarlo, `PATCH` con
`{"is_active": true}`.

### `POST /products/admin/{product_id}/cover`

`multipart/form-data` con el campo `file`. Acepta JPG, PNG o WebP de hasta `MAX_COVER_MB`
(2 MB por defecto). La API la convierte a WebP (calidad 85), la sube al bucket de Supabase
Storage (`SUPABASE_STORAGE_BUCKET`, defecto `product-covers`, debe ser público) y guarda la URL
pública en `cover_url`. Respuesta: el `ProductOut` actualizado.

Errores: `400` formato o tamaño inválido, o imagen ilegible; `503` si faltan `SUPABASE_URL` o
`SUPABASE_SECRET_KEY`; `502` si Supabase rechaza la subida.

### Categorías (admin)

- `POST /products/admin/categories` — `{ "name": "Shonen", "description": "…" }`. El **slug** se
  genera del nombre. `201` con `CategoryOut`; `409` si ya existe.
- `PATCH /products/admin/categories/{category_id}` — `name`, `description`, `is_active`
  (parcial). Si cambia el nombre se recalcula el slug; `409` si choca con otra categoría.
- `DELETE /products/admin/categories/{category_id}` — desactiva la categoría (`204`).

---

## 4. Pedidos y checkout

Prefijo: `/api/orders`

| Método | Ruta | Acceso | Resumen |
|---|---|---|---|
| POST | `/orders/checkout` | Usuario | Reserva stock y crea el pedido |
| GET | `/orders` | Usuario | Mis pedidos |
| GET | `/orders/{order_id}` | Usuario | Detalle de un pedido mío |
| POST | `/orders/{order_id}/cancel` | Usuario | Cancela un pedido mío pendiente |
| GET | `/orders/admin/all` | Admin | Todos los pedidos |
| PATCH | `/orders/admin/{order_id}/status` | Admin | Cambia el estado |

### `POST /orders/checkout`

Cuerpo (`CheckoutRequest`):

| Campo | Tipo | Reglas |
|---|---|---|
| `items` | lista | Al menos 1 elemento |
| `items[].product_id` | string (UUID) | Producto activo |
| `items[].quantity` | int | ≥ 1 |
| `shipping_address` | string | 10–400 caracteres, obligatorio |
| `shipping_name` | string | 2–120, opcional |
| `shipping_phone` | string | 6–30, opcional |
| `shipping_region`, `shipping_comuna` | string | máx. 80, opcional |
| `shipping_notes` | string | máx. 400, opcional |

```json
{
  "items": [{ "product_id": "0b9f…", "quantity": 2 }],
  "shipping_address": "Av. Providencia 1234, depto 56",
  "shipping_name": "Ana Pérez",
  "shipping_phone": "+56912345678",
  "shipping_region": "Metropolitana",
  "shipping_comuna": "Providencia"
}
```

Qué hace, en orden:

1. Valida cada producto (existe y está activo) y su disponibilidad.
2. Reserva el stock con una actualización atómica. Si falla una línea, se revierte todo.
3. Calcula `subtotal = Σ precio × cantidad` con los precios de la base de datos (el cliente no
   puede fijar precios). El envío es `SHIPPING_COST`, o `0` si el subtotal alcanza
   `FREE_SHIPPING_FROM`.
4. Crea el pedido en estado `pending` con `expires_at` (ver «Plazo de la reserva» en el README).
5. Pide la preferencia de pago al proveedor configurado.

Respuesta `201`:

```json
{
  "order_id": 31,
  "payment_provider": "manual",
  "payment_url": null,
  "payment_token": null,
  "external_id": null,
  "payment_instructions": {
    "provider": "manual",
    "bank": "Banco …", "account_type": "Cuenta corriente", "account_number": "…",
    "holder": "…", "rut": "…", "email": "ventas@alpacachino.com",
    "deadline_hours": 24,
    "note": "Transfiere el total y envía el comprobante por correo indicando el número de pedido. …"
  }
}
```

Con `PAYMENT_PROVIDER=manual` no hay `payment_url`; el cliente recibe en `payment_instructions`
los datos de la cuenta (`BANK_*`) y transfiere. Si la pasarela falla, el pedido **queda creado y
reservado** igualmente, sin URL de pago, para poder reintentar.

Errores: `400` UUID inválido; `404` producto inexistente o inactivo; `409` stock insuficiente
(el mensaje indica el título y la cantidad disponible); `422` carrito vacío o cuerpo inválido.

### `GET /orders`

Parámetros: `status` (opcional, ver estados abajo), `page` (1), `size` (10, máx. 50).
Solo devuelve pedidos del usuario de la sesión, del más nuevo al más antiguo. Respuesta:
`OrderPage`.

### `GET /orders/{order_id}`

Respuesta: `OrderOut`. Si el pedido existe pero es de otra persona responde `404`
(no revela su existencia).

```json
{
  "id": 31,
  "user_id": 7,
  "status": "pending",
  "subtotal": "25980",
  "shipping": "3500",
  "total": "29480",
  "shipping_address": "Av. Providencia 1234, depto 56",
  "shipping_name": "Ana Pérez",
  "shipping_phone": "+56912345678",
  "shipping_region": "Metropolitana",
  "shipping_comuna": "Providencia",
  "shipping_notes": null,
  "created_at": "2026-10-26T15:00:00Z",
  "updated_at": "2026-10-26T15:00:00Z",
  "expires_at": "2026-10-27T15:00:00Z",
  "paid_at": null,
  "items": [
    { "id": 55, "product_id": "0b9f…", "sku": "DEMO-001", "title": "Berserk 1",
      "cover_url": null, "quantity": 2, "unit_price": "12990" }
  ]
}
```

`unit_price` es el precio al momento de la compra (no cambia si el producto sube después).
`expires_at` es la hora límite de la reserva y pasa a `null` cuando el pedido se paga.

### `POST /orders/{order_id}/cancel`

El cliente cancela su propio pedido. Solo es posible en estado `pending`; libera la reserva.
`404` si no es suyo; `409` si ya no está pendiente. Respuesta: `OrderOut` en `cancelled`.

### `GET /orders/admin/all`

Parámetros: `status`, `user_id`, `page` (1), `size` (20, máx. 100). Respuesta: `OrderPage`.

### `PATCH /orders/admin/{order_id}/status`

El nuevo estado va **como parámetro de consulta**, sin cuerpo:

```
PATCH /api/orders/admin/31/status?new_status=paid
```

Estados: `pending`, `paid`, `failed`, `cancelled`, `expired`, `shipped`, `delivered`.

Transiciones permitidas (cualquier otra devuelve `409`):

| Desde | Hacia |
|---|---|
| `pending` | `paid`, `failed`, `cancelled`, `expired` |
| `paid` | `shipped`, `cancelled` |
| `shipped` | `delivered` |
| `failed`, `expired`, `cancelled`, `delivered` | (ninguna) |

Efectos secundarios:

- `pending → paid`: consolida la reserva, registra un `Payment` manual (`status: approved`),
  fija `paid_at` y deja `expires_at` en `null`.
- `pending → failed | cancelled | expired`: libera el stock reservado.
- `paid → cancelled`: repone el stock vendido (movimiento `restock` con referencia `order:<id>`).
- Pedir el estado que ya tiene no hace nada y devuelve el pedido tal cual.

---

## 5. Foro

Prefijo: `/api/forum`. Los contenidos «borrados» se ocultan (`is_hidden`) en vez de eliminarse.

| Método | Ruta | Acceso | Resumen |
|---|---|---|---|
| GET | `/forum/posts` | Público | Lista de publicaciones visibles |
| POST | `/forum/posts` | Usuario | Crea una discusión o una reseña |
| GET | `/forum/posts/{post_id}` | Opcional | Detalle |
| PATCH | `/forum/posts/{post_id}` | Usuario (autor o staff) | Edita título/cuerpo |
| DELETE | `/forum/posts/{post_id}` | Usuario (autor o staff) | Oculta la publicación |
| GET | `/forum/posts/{post_id}/comments` | Opcional | Comentarios |
| POST | `/forum/posts/{post_id}/comments` | Usuario | Comenta |
| PATCH | `/forum/comments/{comment_id}` | Usuario (autor o staff) | Edita un comentario |
| DELETE | `/forum/comments/{comment_id}` | Usuario (autor o staff) | Oculta un comentario |
| POST | `/forum/posts/{post_id}/report` | Usuario | Reporta una publicación |
| POST | `/forum/comments/{comment_id}/report` | Usuario | Reporta un comentario |
| GET | `/forum/admin/reports` | Moderador | Lista de reportes |
| PATCH | `/forum/admin/posts/{post_id}/hide` | Moderador | Oculta o muestra |
| PATCH | `/forum/admin/posts/{post_id}/pin` | Moderador | Fija o suelta |
| PATCH | `/forum/admin/posts/{post_id}/lock` | Moderador | Cierra o abre comentarios |
| PATCH | `/forum/admin/comments/{comment_id}/hide` | Moderador | Oculta o muestra |
| PATCH | `/forum/admin/reports/{report_id}/resolve` | Moderador | Marca el reporte resuelto |

### `GET /forum/posts`

| Parámetro | Tipo | Defecto | Descripción |
|---|---|---|---|
| `product_id` | string (UUID) | — | Publicaciones de un producto |
| `author_id` | int | — | Publicaciones de un autor |
| `kind` | `review` \| `discussion` | — | `review` = con `rating`; `discussion` = sin `rating` |
| `q` | string (máx. 80) | — | Busca en título y cuerpo |
| `page` | int | 1 | |
| `size` | int 1–50 | 20 | |

Solo lista publicaciones no ocultas (también para el staff). Orden: primero las **fijadas**,
luego las más nuevas. Respuesta: `PostPage`.

`PostOut`:

```json
{
  "id": 12,
  "author_id": 7,
  "author_username": "ana",
  "title": "Un clásico imprescindible",
  "body": "Texto de la reseña…",
  "product_id": "0b9f…",
  "product": { "id": "0b9f…", "sku": "DEMO-001", "title": "Berserk 1", "cover_url": null },
  "rating": 5,
  "is_hidden": false,
  "is_pinned": false,
  "is_locked": false,
  "created_at": "2026-10-26T15:00:00Z",
  "updated_at": "2026-10-26T15:00:00Z",
  "comments_count": 3
}
```

`comments_count` cuenta solo comentarios visibles.

### `POST /forum/posts`

| Campo | Tipo | Reglas |
|---|---|---|
| `title` | string | 3–160 |
| `body` | string | mínimo 10 |
| `product_id` | string (UUID) | opcional para una discusión; **obligatorio** si hay `rating` |
| `rating` | int | 1–5. Si va, es una **reseña** |

Reglas de las reseñas (cuando viene `rating`):

- Exige `product_id` (`422` si falta).
- El usuario debe tener un pedido **`paid`** que contenga ese producto; si no, `403`
  («Solo puedes reseñar productos que hayas comprado»). Es lo que el frontend muestra como
  «Compra verificada».
- Solo una reseña por usuario y producto; la segunda da `409`.

Una discusión (sin `rating`) puede mencionar un producto o no. Límite: 10 por minuto.
Respuesta `201`: `PostOut`. `400` si el UUID es inválido; `404` si el producto no existe.

### `GET /forum/posts/{post_id}`

Con sesión de moderador o admin se pueden ver publicaciones ocultas; para los demás, una
publicación oculta responde `404`.

### `PATCH /forum/posts/{post_id}`

Cuerpo parcial: `title` (3–160) y/o `body` (mín. 10). Solo el autor o el staff; `403` en otro
caso. No cambia `rating` ni `product_id`.
vuelve a consultar el detalle si necesitas el valor real.

### `DELETE /forum/posts/{post_id}`

Autor o staff. Pone `is_hidden=true` (`204`). Un moderador puede revertirlo con
`/forum/admin/posts/{id}/hide?hide=false`.

### Comentarios

- `GET /forum/posts/{post_id}/comments` — parámetros `page` (1) y `size` (50, máx. 100). Del más
  antiguo al más nuevo; devuelve una lista de `CommentOut` (no un objeto paginado).
- `POST /forum/posts/{post_id}/comments` — `{ "body": "texto" }` (mín. 1 carácter). `403` si la
  publicación está cerrada (`is_locked`); `404` si no existe o está oculta. Límite: 20 por minuto.
  Respuesta `201`: `CommentOut`.
- `PATCH /forum/comments/{comment_id}` — `{ "body": "…" }`. Autor o staff.
- `DELETE /forum/comments/{comment_id}` — oculta el comentario (`204`). Autor o staff.

```json
{
  "id": 40, "post_id": 12, "author_id": 9, "author_username": "luis",
  "body": "Totalmente de acuerdo", "is_hidden": false,
  "created_at": "2026-10-26T15:10:00Z", "updated_at": "2026-10-26T15:10:00Z"
}
```

### Reportes

`POST /forum/posts/{post_id}/report` y `POST /forum/comments/{comment_id}/report` reciben:

```json
{ "reason": "Contiene spoilers sin aviso" }
```

(`reason`: 5–200 caracteres). Respuesta `201`: `{ "status": "reported", "report_id": 3 }`.
`409` si ya reportaste ese mismo contenido; `404` si no existe.

### Moderación

Todas exigen rol `moderator` o `admin`. Los interruptores van como **parámetros de consulta**:

| Ruta | Parámetro (defecto) | Respuesta |
|---|---|---|
| `PATCH /forum/admin/posts/{id}/hide` | `hide` (`true`) | `{ "id", "is_hidden" }` |
| `PATCH /forum/admin/posts/{id}/pin` | `pinned` (`true`) | `{ "id", "is_pinned" }` |
| `PATCH /forum/admin/posts/{id}/lock` | `locked` (`true`) | `{ "id", "is_locked" }` |
| `PATCH /forum/admin/comments/{id}/hide` | `hide` (`true`) | `{ "id", "is_hidden" }` |
| `PATCH /forum/admin/reports/{id}/resolve` | — | `{ "id", "resolved": true }` |

`GET /forum/admin/reports` acepta `resolved` (boolean, opcional), `page` (1) y `size` (20, máx. 100).
Cada elemento trae `post_id`, `comment_id`, `reporter_username`, `reason`, `resolved`,
`resolved_by`, `resolved_at`, `created_at`, `post_title` y `comment_body` para revisar sin abrir
el hilo.

---

## 6. Panel de administración

Prefijo: `/api/admin`. Todas las rutas exigen rol `admin`. Los parámetros marcados como
«consulta» se envían en la URL, no en el cuerpo.

| Método | Ruta | Resumen |
|---|---|---|
| GET | `/admin/dashboard` | KPIs |
| GET | `/admin/inventory/low-stock` | Productos con poco stock |
| PATCH | `/admin/inventory/{product_id}` | Ajuste manual de stock |
| GET | `/admin/inventory/movements/{product_id}` | Historial de movimientos |
| GET | `/admin/users` | Lista de usuarios |
| PATCH | `/admin/users/{user_id}/role` | Cambia el rol |
| PATCH | `/admin/users/{user_id}/toggle-active` | Activa o desactiva |

### `GET /admin/dashboard`

```json
{
  "total_products": 48,
  "total_orders": 120,
  "pending_orders": 4,
  "paid_orders": 80,
  "revenue_this_month": 1450000,
  "low_stock_alerts": 6
}
```

`revenue_this_month` suma el total de los pedidos `paid` con `paid_at` desde el día 1 del mes (UTC).
`low_stock_alerts` cuenta productos activos con 5 o menos unidades disponibles.

### `GET /admin/inventory/low-stock`

Consulta: `threshold` (int ≥ 0, defecto 5). Devuelve una lista de
`{ product_id, sku, title, available, quantity, reserved }`.

### `PATCH /admin/inventory/{product_id}`

Parámetros de **consulta**: `delta` (int, requerido; positivo repone, negativo descuenta),
`reason` (requerido) y `reference` (opcional; por defecto `manual:<product_id>`).

```
PATCH /api/admin/inventory/0b9f…?delta=20&reason=restock&reference=factura-123
```

`reason` debe ser uno de los valores del enum `MovementReason`: `sale`, `reservation`, `restock`,
`adjustment`, `import`, `reservation_released`, `sale_confirmed`. Para ajustes manuales lo habitual
es `restock` (reposición) o `adjustment` (corrección); otro valor da `422`/error de base. Registra un movimiento de auditoría con el id del
admin. Respuesta:

```json
{ "product_id": "0b9f…", "new_quantity": 30, "reserved": 2, "available": 28 }
```

`404` si no hay inventario para ese producto; `400` si el ajuste dejaría el stock en negativo.

### `GET /admin/inventory/movements/{product_id}`

Consulta: `page` (1), `size` (50, máx. 200). Del más reciente al más antiguo.

```json
{
  "items": [
    { "id": 301, "delta": -2, "reason": "reservation", "reference": "reserve:0b9f…",
      "created_by": null, "created_at": "2026-10-26T15:00:00Z" }
  ],
  "total": 14, "page": 1, "size": 50
}
```

`created_by` es el id del admin en ajustes manuales y `null` en movimientos automáticos.

### `GET /admin/users`

Consulta: `role` (`customer` \| `moderator` \| `admin`, opcional), `page` (1), `size` (20, máx. 100).
Cada elemento: `id`, `email`, `username`, `role`, `is_active`, `is_verified`, `created_at`,
`last_login`.

### `PATCH /admin/users/{user_id}/role`

Consulta: `new_role`. `404` si no existe. `400` si intentas **degradar a un admin**
(«No se puede degradar al admin principal»). Respuesta: `{ "id", "role" }`.

### `PATCH /admin/users/{user_id}/toggle-active`

Alterna `is_active`. Un usuario inactivo pierde el acceso (sus tokens dejan de servir).
Respuesta: `{ "id", "is_active" }`.

---

## 7. Configuración y salud

### `GET /config` — Público

Datos de negocio que el frontend no debe tener escritos a mano:

```json
{
  "currency": "CLP",
  "shipping_cost": 3500,
  "free_shipping_from": 30000,
  "reservation_minutes": 1440,
  "payment_provider": "manual",
  "terms_version": "2026-10",
  "seller": { "name": "AlpacachinoStore", "email": "ventas@alpacachino.com", "phone": "" },
  "payment_instructions": { "provider": "manual", "bank": "…", "deadline_hours": 24, "…": "solo con payment_provider=manual" }
}
```

`reservation_minutes` es 1440 con `manual` (24 h) y 15 con una pasarela. `payment_instructions`
es `null` salvo en modo manual.

### `GET /health` — Público

```json
{ "status": "ok", "database": "ok", "version": "0.1.0", "keepalive": { "…": "estado del latido a la base" } }
```

`status` pasa a `degraded` si la base no responde.

### `GET /ready` — Público

`{ "ready": true }`. Sondeo de disponibilidad para el despliegue.

### `GET /` (fuera de `/api`)

`{ "app": "AlpacachinoStore", "env": "development", "docs": "/docs" }`.

---

## 8. Pagos y webhooks

El flujo activo es la transferencia manual y **no usa estas rutas**: el admin confirma con
`PATCH /orders/admin/{id}/status?new_status=paid`. Las rutas de abajo existen para las pasarelas
en línea y se activan con `PAYMENT_PROVIDER=mercadopago` o `webpay`.

| Método | Ruta | Resumen |
|---|---|---|
| POST | `/payments/webhook/mercadopago` | Notificación de pago de Mercado Pago |
| GET, POST | `/payments/webhook/webpay` | Retorno del navegador desde Webpay Plus |
| GET, POST | `/webhooks/whatsapp`, `/webhooks/instagram` | Verificación y recepción de bots (marcador de posición) |

**Mercado Pago.** Si `MP_WEBHOOK_SECRET` está definido, la firma de la cabecera `x-signature`
(junto con `x-request-id`) debe ser válida; si no, `401`. El evento se registra antes de
procesarse, de modo que una notificación repetida responde `duplicado-ignorado`. Solo un pago
`approved` confirma el pedido (se identifica por `external_reference`).

**Webpay.** Recibe `token_ws` (GET, formulario o JSON) y responde con una redirección `303` al
sitio: `…/checkout?status=exito` o `…/checkout?status=error`.

**Confirmación.** En ambos casos, confirmar un pedido consolida la reserva, lo marca `paid`,
guarda el `Payment` y encola el correo de confirmación (`send_order_confirmation`). La operación
es idempotente: un pedido ya pagado no se vuelve a procesar.

Los webhooks de WhatsApp e Instagram solo verifican el token de Meta y acusan recibo; el
procesamiento de mensajes no está implementado (fuera del alcance actual).

---

## 9. Modelos de datos

### Usuario (`UserOut`)

| Campo | Tipo |
|---|---|
| `id` | int |
| `email`, `username` | string |
| `role` | `customer` \| `moderator` \| `admin` |
| `is_active`, `is_verified` | boolean |
| `created_at`, `terms_accepted_at` | datetime |

### Estados de pedido

`pending` · `paid` · `failed` · `cancelled` · `expired` · `shipped` · `delivered`

### Flujo recomendado para el frontend

1. `GET /config` al cargar (costos y plazos).
2. `POST /auth/login` → guarda ambos tokens; renueva con `POST /auth/refresh` ante un `401`.
3. Catálogo con `GET /products` (filtros en la URL).
4. `POST /orders/checkout` y mostrar `payment_instructions` junto con la cuenta regresiva
   hasta `expires_at` del `GET /orders/{id}`.
5. Tras el pago, el admin cambia el estado; el cliente ve la actualización al consultar su pedido.
