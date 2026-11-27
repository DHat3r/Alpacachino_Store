# AlpacachinoStore

Tienda chilena de manga y cómics con un foro donde la comunidad comenta cada tomo.
El pago activo es **transferencia bancaria manual**: el cliente reserva su pedido, transfiere,
y el administrador confirma el pago a mano. (Bots de WhatsApp/Instagram y pasarelas en línea
están fuera del alcance actual; el código de Mercado Pago y Webpay existe pero no es el flujo activo.)

| Capa | Tecnología |
|---|---|
| Backend | FastAPI, SQLAlchemy, Alembic, Celery + Redis |
| Base de datos | PostgreSQL en Supabase (el de Docker solo para pruebas) |
| Frontend | React 18, TypeScript, Vite, Tailwind v4, TanStack Query, Zustand |
| Correo en desarrollo | Mailhog |

> La referencia detallada de cada endpoint está en [`docs/API.md`](docs/API.md).
> El sistema visual del frontend está en [`docs/DISENO.md`](docs/DISENO.md).

---

## 1. Cómo funciona, de punta a punta

### 1.1 El camino de una compra

```
 Cliente                       API                              Administrador
 ───────                       ───                              ─────────────
 navega catálogo ───────────▶  GET /products
 se registra / entra ───────▶  POST /auth/register · /auth/login
 arma el carrito (en el navegador, Zustand)
 confirma el pedido ────────▶  POST /orders/checkout
                               · valida productos activos
                               · RESERVA stock (atómico, sin sobreventa)
                               · calcula precios y envío en el servidor
                               · crea el pedido PENDING con vencimiento
                               ◀── order_id + datos de transferencia
 transfiere desde su banco
 ve el pedido y la cuenta
 regresiva ─────────────────▶  GET /orders/{id}
                                                              ve el pedido PENDING
                               PATCH /orders/admin/{id}/status ◀── marca PAID
                               · la reserva pasa a venta firme
                               · se registra el pago manual
                                                              prepara y despacha
                               PATCH …/status ◀──────────────  SHIPPED → DELIVERED
 reseña el tomo comprado ───▶  POST /forum/posts (con rating)
```

Tres reglas sostienen todo el flujo:

1. **El servidor manda en los precios.** El carrito solo envía `product_id` y cantidad; el
   subtotal, el envío y el total se calculan en el backend con el precio vigente.
2. **El stock se reserva, no se descuenta a ciegas.** Al hacer checkout se ejecuta un
   `UPDATE … WHERE quantity >= :qty` atómico. Si dos personas compran el último tomo a la vez,
   una de las dos recibe `409`. Cada cambio de stock deja un registro en `inventory_movements`.
3. **Las reservas vencen.** Un pedido `PENDING` guarda stock hasta `expires_at`. Si no se paga,
   una tarea de Celery lo pasa a `EXPIRED` y devuelve el stock.

### 1.2 Estados de un pedido

```
            ┌──────────▶ PAID ──────▶ SHIPPED ──────▶ DELIVERED
            │             │
 PENDING ───┤             └────────▶ CANCELLED   (repone el stock vendido)
            ├──────────▶ CANCELLED  (el cliente o el admin; libera la reserva)
            ├──────────▶ EXPIRED    (automático; libera la reserva)
            └──────────▶ FAILED     (libera la reserva)
```

`FAILED`, `EXPIRED`, `CANCELLED` y `DELIVERED` son finales. Cualquier otra transición devuelve
`409`. Qué le pasa al stock en cada salto:

| Transición | Efecto en inventario |
|---|---|
| (checkout) → `PENDING` | `quantity − n`, `reserved + n` |
| `PENDING` → `PAID` | `reserved − n` (la unidad ya estaba descontada) |
| `PENDING` → `CANCELLED` / `EXPIRED` / `FAILED` | `quantity + n`, `reserved − n` |
| `PAID` → `CANCELLED` | `quantity + n` (reposición con auditoría) |

### 1.3 Plazo de la reserva

El plazo depende del medio de pago y lo informa `GET /api/config` (`reservation_minutes`),
así el frontend nunca lo escribe a mano:

- `PAYMENT_PROVIDER=manual` → `MANUAL_PAYMENT_HOURS` (24 h por defecto).
- Con una pasarela en línea → `STOCK_RESERVATION_MINUTES` (15 min por defecto).

### 1.4 Foro y reseñas

El foro tiene dos tipos de publicación: **discusión** (sin `rating`) y **reseña** (con `rating`
de 1 a 5 y un `product_id`). Para reseñar hay que haber comprado el producto: el backend exige
un pedido `PAID` que lo contenga, y solo se permite una reseña por usuario y producto.
Los borrados son lógicos (`is_hidden`), así el equipo de moderación puede revisarlos.
Cualquier usuario puede reportar una publicación o comentario; moderadores y administradores
resuelven los reportes, y pueden ocultar, fijar o cerrar hilos.

### 1.5 Roles

| Rol | Puede |
|---|---|
| `customer` | Comprar, ver sus pedidos, publicar y comentar, reportar |
| `moderator` | Todo lo anterior + moderar el foro (ocultar, fijar, cerrar, resolver reportes) |
| `admin` | Todo + catálogo, inventario, pedidos de todos, usuarios y panel de métricas |

### 1.6 Tareas en segundo plano

Celery (worker + beat) corre tres tareas programadas, en zona horaria `America/Santiago`:

| Tarea | Frecuencia | Qué hace |
|---|---|---|
| `expire_reservations` | cada 60 s | Pasa a `EXPIRED` los pedidos vencidos y libera su stock |
| `daily_report` | 08:00 | Envía al admin un resumen de pedidos, ingresos y stock bajo |
| `ping` | cada 5 min | Latido de prueba del worker |

Además, el correo de confirmación del pedido se envía con `send_order_confirmation`
(por SMTP; en desarrollo se ve en Mailhog).

### 1.7 Privacidad

`DELETE /api/auth/me` **anonimiza** la cuenta en vez de borrarla: se pierden los datos
personales y el acceso, pero se conservan los pedidos (obligación tributaria) y el foro queda
con «usuario eliminado». El registro guarda la fecha y la versión de los términos aceptados.

---

## 2. Estructura del repositorio

```
Alpacachino_Store/
├── back/                    API (FastAPI)
│   ├── app/
│   │   ├── main.py          punto de entrada, CORS, cabeceras de seguridad
│   │   ├── api/routes/      auth, products, orders, payments, admin, forum, config, health, webhooks
│   │   ├── api/deps.py      usuario actual y control de roles
│   │   ├── models/          tablas SQLAlchemy
│   │   ├── schemas/         validación de entrada/salida (Pydantic)
│   │   ├── services/        inventario, pagos, correo, keepalive
│   │   ├── tasks.py         tareas Celery
│   │   └── worker.py        configuración de Celery y calendario (beat)
│   ├── alembic/             migraciones
│   ├── scripts/             seed_demo.py, import_catalog.py, check_db.py
│   └── tests/               pruebas (pytest)
├── front/                   Tienda (React + Vite)
├── docs/
│   ├── API.md               referencia de endpoints
│   └── DISENO.md            sistema visual, modo oscuro, panel de administración
├── .github/workflows/ci.yml pytest + build/tests del front + imágenes Docker
├── docker-compose.yml       db, redis, api, worker, beat, web, mailhog, adminer
├── render.yaml              despliegue del backend en Render (API, worker, beat, Redis)
├── front/vercel.json        despliegue del frontend en Vercel
└── .env.example             variables de entorno documentadas
```

`PASOS_A_SEGUIR.md` (hoja de ruta) y `DEPLOY.md` (despliegue) son notas locales: están en
`.gitignore` y no se versionan.

---

## 3. Puesta en marcha local

Requisitos: Docker Desktop abierto y un proyecto de Supabase. La base de datos es **Supabase**:
la API, el worker y beat se conectan con `DATABASE_URL`. El PostgreSQL de Docker (`db`) ya no
se levanta por defecto; queda en el perfil `local-db` para las pruebas o para trabajar sin
conexión.

```bash
cp .env.example .env          # completa DATABASE_URL y las claves de Supabase (sección 4)
docker compose up -d
docker compose exec -T api python scripts/check_db.py        # confirma que conecta a Supabase
docker compose exec -T api alembic upgrade head              # deja el esquema al día
```

Sin conexión, deja `DATABASE_URL` vacía y levanta también la base local:
`docker compose --profile local-db up -d`.

| Servicio | Dirección |
|---|---|
| Tienda (frontend) | http://localhost:5173 |
| API | http://localhost:8001 (puerto de `API_PORT`; `.env.example` trae 8000) |
| Documentación interactiva | http://localhost:8001/docs (solo con `DEBUG=true`) |
| Correos de prueba (Mailhog) | http://localhost:8025 |
| Adminer (base de datos) | http://localhost:8081 (perfil `tools`) |
| PostgreSQL local | `localhost:5433` (perfil `local-db`) |

`seed_demo.py` crea categorías, ~48 productos, 5 usuarios `@demo.cl`, hilos del foro y pedidos
en todos los estados. Es idempotente; con `--reset` lo regenera. Los usuarios demo comparten la
clave `Demo1234`. **Solo contra la base local: con `DATABASE_URL` definida escribiría en Supabase.**

Apagar y encender:

```bash
docker compose stop        # apaga, conserva contenedores y datos
docker compose up -d       # vuelve a encender
docker compose down        # elimina contenedores (los datos siguen en el volumen)
```

### Pruebas

```bash
docker compose --profile local-db up -d db    # las pruebas usan el PostgreSQL local
docker compose exec -T api pytest
```

La suite crea su propia base `<POSTGRES_DB>_test` en el PostgreSQL local y **nunca toca
Supabase**: `conftest.py` vacía `DATABASE_URL` antes de cargar la app. En el front, `npm test` corre Vitest. La CI
(`.github/workflows/ci.yml`) ejecuta ambas en cada push o PR a `main`/`develop`, valida las
migraciones y construye las imágenes Docker de producción.

### Scripts del backend

```bash
docker compose exec -T api python scripts/seed_demo.py [--reset]
docker compose exec -T api python scripts/import_catalog.py --file data/catalogo.xlsx --dry-run
docker compose exec -T api python scripts/check_db.py [--loop 5]
```

`import_catalog.py` carga un Excel con columnas `sku`, `titulo`, `precio` y `stock` (obligatorias)
y `autor`, `editorial`, `descripcion`, `categoria` (opcionales); acepta precios como `$12.990`.
`--dry-run` valida sin escribir y `--limit N` procesa solo las primeras filas. Si el SKU ya existe,
actualiza el producto en vez de duplicarlo.

`clean_marketplace.py` convierte el Excel extraído de Facebook Marketplace (columnas `Título del
Manga`, `Editorial`, `Tomo / Volumen`, `Condición`, `Precio (CLP)`) al formato del importador:
genera SKU estables (`MP-…`), corrige columnas corridas y erratas, asigna categoría y deja una hoja
`revisar` con lo que conviene mirar a mano. Los casos especiales (filas con todo en el título,
títulos mal escritos) están en los diccionarios del principio del script.

```bash
docker compose cp Archivos/catalogo.xlsx api:/tmp/catalogo.xlsx
docker compose exec -T api python scripts/clean_marketplace.py --file /tmp/catalogo.xlsx --out /tmp/limpio.xlsx
docker compose exec -T api python scripts/import_catalog.py --file /tmp/limpio.xlsx --dry-run
``` `check_db.py`
comprueba la conexión configurada y muestra el latido de stock.

### Frontend sin Docker

```bash
cd front
npm install
npm run dev        # http://localhost:5173 (proxy /api → localhost:8001)
npm run build      # tsc + vite build
npm test           # Vitest
npm run schema     # regenera src/api/schema.d.ts desde back/openapi.json
```

En producción el front usa `VITE_API_URL` para apuntar a la API; `VITE_PROXY_TARGET` cambia el
destino del proxy en desarrollo.

---

## 4. Configuración (`.env`)

Las variables más importantes. La lista completa, comentada, está en `.env.example`.

| Variable | Para qué |
|---|---|
| `SECRET_KEY` | Firma de los JWT (mínimo 32 caracteres) |
| `ENV`, `DEBUG` | `production` activa HSTS; `DEBUG=false` oculta `/docs` |
| `DATABASE_URL` | Conexión a la base de Supabase (cadena del *Session pooler*, puerto 5432). Si está vacía se usan las `POSTGRES_*` del Docker local |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | API de Supabase: Storage (portadas) y el latido de `/health`. **No** conectan la base de datos |
| `BACKEND_CORS_ORIGINS`, `PUBLIC_SITE_URL` | Orígenes permitidos y URL pública del sitio |
| `PAYMENT_PROVIDER` | `manual` para transferencia (flujo activo). **Ojo:** el valor por defecto y el de `.env.example` es `mercadopago`, hay que cambiarlo |
| `DB_KEEPALIVE_SECONDS` | Cada cuánto la API consulta la base para mantener viva la sesión de Supabase (300; `0` lo apaga) |
| `MANUAL_PAYMENT_HOURS` | Plazo de la reserva en transferencia (24) |
| `BANK_NAME`, `BANK_ACCOUNT_TYPE`, `BANK_ACCOUNT_NUMBER`, `BANK_HOLDER`, `BANK_RUT`, `BANK_EMAIL` | Datos que ve el cliente para transferir |
| `SHIPPING_COST`, `FREE_SHIPPING_FROM` | Envío fijo y umbral de envío gratis (CLP) |
| `SELLER_NAME`, `SELLER_EMAIL`, `SELLER_PHONE` | Datos del vendedor mostrados en el sitio |
| `SMTP_*`, `MAIL_FROM` | Correo saliente (Mailhog en local) |
| `SUPABASE_STORAGE_BUCKET` | Bucket público de portadas (`product-covers`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` | Vida de los tokens (30 min / 7 días) |

> `.env` contiene secretos y no se versiona. Si una clave se filtra, rótala.

---

## 5. Seguridad en una mirada

- Contraseñas con hash; JWT de acceso (30 min) y de refresco (7 días).
- Límites de tasa por IP: registro 5/min, login 10/min, publicar 10/min, comentar 20/min.
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Row Level Security activada en las 15 tablas de Supabase; la API entra con credenciales de
  servidor y la Data API no expone ninguna tabla.
- Los webhooks de pago son idempotentes (se registra el evento antes de procesarlo).

---

## 6. Dónde seguir

Ya están hechas las pestañas del panel admin para productos, categorías y moderación, la subida
de portadas a Supabase Storage y el orden por columna del inventario.

Pendiente:

- Recuperación de contraseña (requiere un endpoint nuevo).
- El despliegue (`render.yaml`, `front/vercel.json`; notas locales en `DEPLOY.md`).
