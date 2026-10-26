import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import { Aviso, Cargando, Estrellas, Vacio } from "../components/ui";
import { api } from "../api/client";
import { useConfig } from "../api/config";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { clp, duracionReserva, fecha } from "../lib/format";

interface Product {
  id: string;
  sku: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  description: string | null;
  price: number;
  cover_url: string | null;
  category: { name: string } | null;
  inventory_quantity: number;
  inventory_reserved: number;
  available_stock?: number | null;
  rating_avg: number | null;
  reviews_count: number;
}

interface Resena {
  id: number;
  author_username: string;
  title: string;
  body: string;
  rating: number | null;
  created_at: string;
}

function detalle(err: unknown, porDefecto: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof d === "string") return d;
  return porDefecto;
}

export default function ProductDetail() {
  const { sku } = useParams<{ sku: string }>();
  const { add } = useCart();
  const { isAuthenticated } = useAuth();
  const { data: config } = useConfig();
  const queryClient = useQueryClient();

  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  const { data: producto, isLoading, error } = useQuery({
    queryKey: ["product", sku],
    queryFn: async () => {
      const res = await api.get(`/products/${sku}`);
      return res.data as Product;
    },
    enabled: !!sku,
  });

  const { data: resenas } = useQuery({
    queryKey: ["product-resenas", producto?.id],
    queryFn: async () => {
      const res = await api.get("/forum/posts", {
        params: { product_id: producto!.id, kind: "review", size: 20 },
      });
      return res.data.items as Resena[];
    },
    enabled: !!producto?.id,
  });

  if (isLoading) return <Cargando texto="Cargando el título" />;
  if (error || !producto)
    return (
      <div className="contenedor py-16">
        <Vacio
          titulo="No encontramos este título"
          texto="Puede que ya no esté publicado."
          accion={{ a: "/catalogo", texto: "Volver al catálogo" }}
        />
      </div>
    );

  const stock =
    typeof producto.available_stock === "number"
      ? producto.available_stock
      : producto.inventory_quantity - producto.inventory_reserved;
  const agotado = stock <= 0;

  const agregar = () => {
    for (let i = 0; i < cantidad; i++) {
      add({
        productId: producto.id,
        sku: producto.sku,
        title: producto.title,
        price: Number(producto.price),
        coverUrl: producto.cover_url || undefined,
      });
    }
    setAgregado(true);
    window.setTimeout(() => setAgregado(false), 4000);
  };

  return (
    <div className="contenedor py-8">
      <nav className="mb-6 text-sm text-tinta-suave">
        <Link to="/catalogo" className="hover:text-morado-texto">
          Catálogo
        </Link>
        <span className="px-2 text-humo">/</span>
        <span>{producto.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative aspect-[3/4] overflow-hidden rounded-panel border border-humo bg-papel">
            {producto.cover_url ? (
              <img
                src={producto.cover_url}
                alt={`Portada de ${producto.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-papel-hondo px-6 text-center">
                <Alpaca className="h-16 w-16 text-humo" />
                <span className="font-display text-lg font-extrabold leading-tight text-tinta-suave">
                  {producto.title}
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          {producto.category?.name && (
            <p className="text-sm font-medium text-tinta-suave">{producto.category.name}</p>
          )}
          <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
            {producto.title}
          </h1>

          {producto.rating_avg != null && (
            <a href="#resenas" className="mt-3 inline-block">
              <Estrellas valor={producto.rating_avg} cantidad={producto.reviews_count} />
            </a>
          )}

          <p className="mt-5 font-display text-4xl font-extrabold text-morado-texto">
            {clp(producto.price)}
          </p>

          <p className="mt-2 text-sm">
            {agotado ? (
              <span className="font-semibold text-alerta">Sin stock por ahora</span>
            ) : stock <= 3 ? (
              <span className="font-semibold text-durazno-hondo">
                Quedan {stock} {stock === 1 ? "copia" : "copias"}
              </span>
            ) : (
              <span className="text-exito">Disponible para despacho</span>
            )}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-humo bg-superficie">
              <button
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                className="px-4 py-2.5 text-lg leading-none hover:text-morado-texto"
                aria-label="Quitar una unidad"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold">{cantidad}</span>
              <button
                onClick={() => setCantidad((c) => Math.min(Math.max(1, stock), c + 1))}
                className="px-4 py-2.5 text-lg leading-none hover:text-morado-texto"
                aria-label="Agregar una unidad"
              >
                +
              </button>
            </div>
            <button
              onClick={agregar}
              disabled={agotado}
              className="btn btn-primario btn-grande flex-1 sm:flex-none"
            >
              {agotado ? "Sin stock" : "Agregar al carrito"}
            </button>
          </div>

          {agregado && (
            <div className="mt-4">
              <Aviso tono="ok">
                Agregado al carrito.{" "}
                <Link to="/carrito" className="font-semibold underline underline-offset-4">
                  Ir al carrito
                </Link>
              </Aviso>
            </div>
          )}

          <dl className="mt-8 grid gap-x-8 gap-y-3 border-t border-humo pt-6 text-sm sm:grid-cols-2">
            {producto.author && <Dato termino="Autoría" valor={producto.author} />}
            {producto.publisher && <Dato termino="Editorial" valor={producto.publisher} />}
            {producto.isbn && <Dato termino="ISBN" valor={producto.isbn} />}
            <Dato termino="SKU" valor={producto.sku} />
          </dl>

          {producto.description && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-extrabold">Sobre este tomo</h2>
              <p className="mt-2 max-w-prose whitespace-pre-line leading-relaxed text-tinta-suave">
                {producto.description}
              </p>
            </div>
          )}

          {config && (
            <div className="panel-papel mt-8 p-5 text-sm leading-relaxed text-tinta-suave">
              Despacho {clp(config.shipping_cost)} a todo Chile, gratis sobre{" "}
              {clp(config.free_shipping_from)}. Al confirmar el pedido reservamos el stock
              por {duracionReserva(config.reservation_minutes)} mientras haces la
              transferencia.
            </div>
          )}
        </div>
      </div>

      <section id="resenas" className="mt-16 scroll-mt-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="titulo-seccion">Reseñas de la comunidad</h2>
          <Link to={`/foro?producto=${producto.id}`} className="enlace text-sm">
            Ver conversaciones de este título
          </Link>
        </div>

        <FormularioResena
          productoId={producto.id}
          productoTitulo={producto.title}
          autenticado={isAuthenticated()}
          onPublicada={() => {
            queryClient.invalidateQueries({ queryKey: ["product-resenas", producto.id] });
            queryClient.invalidateQueries({ queryKey: ["product", sku] });
          }}
        />

        <div className="mt-6 space-y-4">
          {resenas && resenas.length > 0 ? (
            resenas.map((r) => (
              <article key={r.id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-morado-tenue font-bold text-morado-texto">
                    {r.author_username[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div>
                    <p className="font-semibold">{r.author_username}</p>
                    <p className="text-xs text-tinta-suave">{fecha(r.created_at)}</p>
                  </div>
                  {r.rating != null && (
                    <span className="insignia ml-auto bg-exito-tenue text-exito">
                      Compra verificada
                    </span>
                  )}
                </div>
                {r.rating != null && (
                  <p className="mt-3 text-durazno">
                    {"★".repeat(r.rating)}
                    <span className="text-humo">{"★".repeat(5 - r.rating)}</span>
                  </p>
                )}
                <h3 className="mt-2 font-display text-lg font-extrabold">
                  <Link to={`/foro/${r.id}`} className="hover:text-morado-texto">
                    {r.title}
                  </Link>
                </h3>
                <p className="mt-1 whitespace-pre-line leading-relaxed text-tinta-suave">
                  {r.body}
                </p>
              </article>
            ))
          ) : (
            <p className="text-tinta-suave">
              Todavía nadie reseña este título. Si lo compraste, parte tú.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-humo/60 pb-2">
      <dt className="text-tinta-suave">{termino}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}

function FormularioResena({
  productoId,
  productoTitulo,
  autenticado,
  onPublicada,
}: {
  productoId: string;
  productoTitulo: string;
  autenticado: boolean;
  onPublicada: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [estrellas, setEstrellas] = useState(5);

  const publicar = useMutation({
    mutationFn: async () => {
      const res = await api.post("/forum/posts", {
        title: titulo,
        body: cuerpo,
        product_id: productoId,
        rating: estrellas,
      });
      return res.data;
    },
    onSuccess: () => {
      setAbierto(false);
      setTitulo("");
      setCuerpo("");
      onPublicada();
    },
  });

  if (!autenticado) {
    return (
      <Aviso>
        <Link to="/login" className="font-semibold underline underline-offset-4">
          Inicia sesión
        </Link>{" "}
        para reseñar los títulos que compraste.
      </Aviso>
    );
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="btn btn-secundario">
        Escribir reseña
      </button>
    );
  }

  return (
    <form
      className="panel space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        publicar.mutate();
      }}
    >
      <h3 className="font-display text-lg font-extrabold">Tu reseña de {productoTitulo}</h3>

      <fieldset>
        <legend className="etiqueta-campo">Puntuación</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setEstrellas(n)}
              aria-label={`${n} de 5`}
              aria-pressed={estrellas === n}
              className={`text-2xl leading-none transition-colors ${
                n <= estrellas ? "text-durazno" : "text-humo hover:text-durazno/60"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="resena-titulo" className="etiqueta-campo">
          Título
        </label>
        <input
          id="resena-titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          minLength={3}
          maxLength={160}
          required
          className="campo"
          placeholder="Un arranque lento que vale la pena"
        />
      </div>

      <div>
        <label htmlFor="resena-cuerpo" className="etiqueta-campo">
          Tu opinión
        </label>
        <textarea
          id="resena-cuerpo"
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          minLength={10}
          rows={5}
          required
          className="campo"
          placeholder="¿Qué te pareció la edición, la traducción, la historia?"
        />
      </div>

      {publicar.isError && (
        <Aviso tono="error">
          {detalle(
            publicar.error,
            "Para reseñar necesitas una compra confirmada de este título.",
          )}
        </Aviso>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={publicar.isPending} className="btn btn-primario">
          {publicar.isPending ? "Publicando…" : "Publicar reseña"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="btn btn-secundario">
          Cancelar
        </button>
      </div>
    </form>
  );
}
