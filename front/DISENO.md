# Sistema visual — AlpacachinoStore

La idea: **la página es "nube"** (gris frío), **el contenido vive en paneles de papel** con
medianiles visibles —como las viñetas de una página de manga— y **el morado es estructura**
(bandas, estados, acciones), no decoración. La pieza que identifica a la tienda es la *obi*: la
faja morada con el precio que cruza la portada, igual que el cintillo de papel de un tomo japonés.

## Colores

Están definidos como tokens de Tailwind v4 en `src/index.css` (bloque `@theme`), así que se usan
como cualquier utilidad: `bg-papel`, `text-tinta`, `border-humo`, `bg-morado`…

| Token | Hex | Para qué |
|---|---|---|
| `nube` | `#e9ebf2` | Fondo de la página |
| `nube-hondo` | `#dadeeb` | Barras de carga, insignias neutras |
| `papel` | `#f7f0e6` | Paneles destacados, barra superior |
| `papel-hondo` | `#efe3d2` | Portadas sin imagen |
| `humo` | `#d3d1de` | Bordes y separadores |
| `tinta` | `#1b1420` | Texto principal y pie de página |
| `tinta-suave` | `#5a4f63` | Texto secundario |
| `morado` | `#5b2ba6` | Marca, botones, obi, estado activo |
| `morado-hondo` | `#46207f` | Hover de botones |
| `morado-tenue` | `#ece2fb` | Fondos suaves, avatares |
| `lila` | `#b79cf0` | Acentos sobre fondo tinta |
| `durazno` / `durazno-hondo` | `#e5a21a` / `#845200` | Estrellas, poco stock, pedido por pagar |
| `exito` / `alerta` | `#15603f` / `#b3261e` | Confirmaciones y errores |

Los tonos "tenue" son para fondos; los "hondo" para el texto encima de ellos (contraste AA).

## Tipografía

- **Bricolage Grotesque** (600/800) para títulos, precios y la marca: `font-display`.
- **Figtree** (400–700) para el resto: `font-sans`.

Se cargan desde Google Fonts en `index.html`.

## Modo oscuro

No hay ni una clase `dark:` en las páginas. Las utilidades de Tailwind apuntan a variables CSS,
así que el tema oscuro sólo redefine esas variables en `src/index.css`:

- `:root[data-tema="oscuro"]` cuando la persona lo elige a mano.
- `@media (prefers-color-scheme: dark) { :root:not([data-tema="claro"]) }` cuando no eligió nada
  y el sistema está en oscuro.

La elección se guarda en `localStorage` (`alpacachino-tema`) y un script corto en `index.html` la
aplica antes de pintar, así no parpadea en claro al cargar. El botón del sol/luna está en la barra
superior y usa el hook `useTema()` de `src/lib/tema.ts`.

Dos tokens existen justamente para que el tema no rompa nada:

- `superficie`: el fondo de paneles y campos (blanco en claro, casi negro en oscuro). **Usa
  `bg-superficie`, no `bg-white`.**
- `nocturno` / `nocturno-texto`: bloques que son oscuros en los dos temas (pie de página y la
  franja del foro en la portada).
- `morado-texto`: el morado para *texto* (en oscuro aclara a `#c4a6f7` para que se lea). `morado`
  sigue siendo el fondo de botones y de la obi.

## El sombrero de Alpachino

`<Alpaca sombrero />` le pone el fedora; `<Alpaca sombrero animarSombrero />` hace que entre por
arriba, dé una vuelta completa en el aire y caiga en su cabeza (`@keyframes sombrero-vuela`,
1,5 s). Se anima al entrar a la portada y al caer en un 404; en la barra y en el pie va quieto.
En la portada hay un botón chico «Repetir» abajo a la derecha del panel morado: cambia la llave
(`key={vuelo}`) de la alpaca, con eso React la vuelve a montar y el sombrero sale volando otra vez.
Con `prefers-reduced-motion` el sombrero aparece puesto, sin vuelo.

## Clases compartidas

Definidas en `@layer components` de `src/index.css`:

- `.contenedor` — ancho máximo y márgenes laterales de todas las páginas.
- `.panel` / `.panel-papel` — la superficie base del contenido.
- `.btn` + `.btn-primario` / `.btn-secundario` / `.btn-fantasma` / `.btn-peligro` / `.btn-grande`.
- `.campo` y `.etiqueta-campo` — formularios.
- `.insignia`, `.enlace`, `.titulo-seccion`, `.texto-largo` (textos legales), `.obi`.

## Componentes

| Archivo | Qué hace |
|---|---|
| `components/Layout.tsx` | Barra superior, navegación, carrito, menú de cuenta y pie de página. Todas las rutas cuelgan de él. |
| `components/Alpaca.tsx` | La marca, en SVG. Hereda el color con `currentColor`. **Para cambiar el logo, se reemplaza solo este archivo** (y `public/alpaca.svg` para el favicon). |
| `components/FichaProducto.tsx` | Ficha del catálogo, con la obi y el estado de stock. |
| `components/ui.tsx` | `EstadoPedido`, `Estrellas`, `Aviso`, `Vacio`, `Cargando`, `ErrorCarga`, `FichaSkeleton`, `Paginacion`. |
| `lib/format.ts` | `clp`, `fecha`, `fechaHora`, `plural`, `faltan`, `duracionReserva`. |

## Reglas que conviene mantener

1. Nada de valores fijos de negocio en las páginas: el costo de envío, el envío gratis y el plazo
   de reserva salen de `/api/config` (`useConfig()`).
2. Los estados de pedido se escriben en español con `textoEstado` / `<EstadoPedido>`, nunca el
   valor crudo de la API.
3. Movimiento mínimo: solo el leve levantar de las fichas al pasar el cursor. `prefers-reduced-motion`
   está respetado en `index.css`.
4. Foco visible en morado en todo lo interactivo (`:focus-visible` en la capa base).
