import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import Alpaca from "../components/Alpaca";
import FichaProducto, { type ProductoFicha } from "../components/FichaProducto";
import { FichaSkeleton } from "../components/ui";
import { api } from "../api/client";
import { useConfig } from "../api/config";
import { clp, duracionReserva, fecha, plural } from "../lib/format";

interface PostResumen {
  id: number;
  title: string;
  body: string;
  author_username: string;
  created_at: string;
  comments_count: number;
  rating: number | null;
}

export default function Home() {
  const { data: config } = useConfig();

  const { data: novedades, isLoading } = useQuery({
    queryKey: ["home-novedades"],
    queryFn: async () => {
      const res = await api.get("/products", { params: { sort: "newest", size: 8 } });
      return res.data.items as ProductoFicha[];
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["home-foro"],
    queryFn: async () => {
      const res = await api.get("/forum/posts", { params: { size: 3 } });
      return res.data.items as PostResumen[];
    },
  });

  // Cambiar la llave vuelve a montar la alpaca, y con eso el sombrero vuela de nuevo.
  const [vuelo, setVuelo] = useState(0);

  const reserva = config ? duracionReserva(config.reservation_minutes) : null;
  const portadas = (novedades ?? []).filter((p) => p.cover_url).slice(0, 3);
  const hayPortadas = portadas.length >= 3;

  return (
    <>
      {/* Portada: una doble página de manga, con medianiles entre viñetas. */}
      <section className="contenedor py-8 sm:py-12">
        <div className="grid gap-2 lg:grid-cols-12">
          <div className="panel-papel flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-16 lg:col-span-7">
            <h1 className="max-w-xl font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Manga y cómics con comunidad incluida.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-tinta-suave">
              {reserva
                ? `Stock real, reserva de ${reserva} para pagar por transferencia y un foro donde se comenta cada tomo.`
                : "Stock real, pago por transferencia y un foro donde se comenta cada tomo."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalogo" className="btn btn-primario btn-grande">
                Ver catálogo
              </Link>
              <Link to="/foro" className="btn btn-secundario btn-grande">
                Entrar al foro
              </Link>
            </div>
          </div>

          <div className={`grid gap-2 lg:col-span-5 ${hayPortadas ? "grid-cols-2" : ""}`}>
            {hayPortadas &&
              portadas.map((p) => (
                <Link
                  key={p.id}
                  to={`/producto/${p.sku}`}
                  className="group relative aspect-[3/4] overflow-hidden rounded-ficha border border-humo bg-papel"
                >
                  <img
                    src={p.cover_url ?? ""}
                    alt={p.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                </Link>
              ))}

            <div className="relative flex min-h-64 flex-col items-center justify-center gap-4 overflow-hidden rounded-ficha bg-morado p-6 text-center">
              <div className="relative rounded-2xl bg-superficie px-4 py-2.5 text-sm font-semibold text-tinta">
                ¡Llegó tomo nuevo!
                <span className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 bg-superficie" />
              </div>
              <Alpaca
                key={vuelo}
                sombrero
                animarSombrero
                className={hayPortadas ? "h-20 w-20 text-lila" : "h-36 w-36 text-lila"}
              />
              {!hayPortadas && (
                <p className="max-w-xs text-sm leading-relaxed text-white/75">
                  Alpachino revisa cada tomo antes de despacharlo.
                </p>
              )}

              <button
                onClick={() => setVuelo((n) => n + 1)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Volver a reproducir la animación del sombrero"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v4h4" />
                </svg>
                Repetir
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Novedades */}
      <section className="contenedor py-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="titulo-seccion">Novedades</h2>
          <Link to="/catalogo" className="enlace text-sm">
            Ver todo el catálogo
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {isLoading
            ? [...Array(4)].map((_, i) => <FichaSkeleton key={i} />)
            : novedades?.map((p) => <FichaProducto key={p.id} producto={p} />)}
        </div>
      </section>

      {/* Cómo funciona la compra */}
      <section className="contenedor py-12">
        <div className="panel-papel grid gap-8 px-6 py-10 sm:px-10 md:grid-cols-3">
          <Dato
            titulo="Despacho a todo Chile"
            texto={
              config
                ? `Envío ${clp(config.shipping_cost)}, gratis sobre ${clp(
                    config.free_shipping_from,
                  )}.`
                : "Starken y Chilexpress a cualquier región."
            }
            icono={
              <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            }
          />
          <Dato
            titulo={reserva ? `Reserva de ${reserva}` : "Reserva de stock"}
            texto="Al confirmar el pedido guardamos el stock mientras haces la transferencia."
            icono={<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
          />
          <Dato
            titulo="Pago por transferencia"
            texto="Te mostramos los datos bancarios y confirmamos al recibir el comprobante."
            icono={
              <path d="M4 7h16v10H4zM4 11h16M8 15h4" />
            }
          />
        </div>
      </section>

      {/* Foro */}
      <section className="bg-nocturno py-14 text-nocturno-texto">
        <div className="contenedor">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="titulo-seccion text-white">Lo último del foro</h2>
            <Link to="/foro" className="text-sm font-semibold text-lila hover:text-white">
              Ver todas las conversaciones
            </Link>
          </div>

          {posts && posts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/foro/${post.id}`}
                  className="group rounded-ficha bg-white/5 p-5 transition-colors hover:bg-white/10"
                >
                  {post.rating != null && (
                    <p className="mb-2 text-sm text-durazno">
                      {"★".repeat(post.rating)}
                      <span className="text-white/25">{"★".repeat(5 - post.rating)}</span>
                    </p>
                  )}
                  <h3 className="font-display text-lg font-extrabold leading-snug text-white">
                    {post.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm text-nocturno-texto/70">{post.body}</p>
                  <p className="mt-4 text-xs text-nocturno-texto/50">
                    {post.author_username}
                    <span className="mx-2 text-white/20">|</span>
                    {fecha(post.created_at)}
                    <span className="mx-2 text-white/20">|</span>
                    {plural(post.comments_count, "comentario", "comentarios")}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-nocturno-texto/70">
              Todavía no hay publicaciones.{" "}
              <Link to="/foro" className="font-semibold text-lila hover:text-white">
                Abre la primera conversación
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function Dato({
  titulo,
  texto,
  icono,
}: {
  titulo: string;
  texto: string;
  icono: ReactNode;
}) {
  return (
    <div>
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7 text-morado-texto"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icono}
      </svg>
      <h3 className="mt-3 font-display text-lg font-extrabold">{titulo}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-tinta-suave">{texto}</p>
    </div>
  );
}
