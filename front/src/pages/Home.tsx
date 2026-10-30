import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import FichaProducto, { type ProductoFicha } from "../components/FichaProducto";
import { FichaSkeleton } from "../components/ui";
import { api } from "../api/client";

export default function Home() {
  const { data: novedades, isLoading } = useQuery({
    queryKey: ["home-novedades"],
    queryFn: async () => {
      const res = await api.get("/products", { params: { sort: "newest", size: 8 } });
      return res.data.items as ProductoFicha[];
    },
  });

  // Cambiar la llave vuelve a montar la alpaca, y con eso el sombrero vuela de nuevo.
  const [vuelo, setVuelo] = useState(0);

  const portadas = (novedades ?? []).filter((p) => p.cover_url).slice(0, 3);
  const hayPortadas = portadas.length >= 3;

  return (
    <>
      {/* Portada: una doble página de manga, con medianiles entre viñetas. */}
      <section className="contenedor py-8 sm:py-12">
        <div className="grid gap-2 lg:grid-cols-12">
          <div className="panel-papel flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-16 lg:col-span-7">
            <h1 className="max-w-xl font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Manga y cómics con stock real.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-tinta-suave">
              Busca por título o autor, filtra por categoría y precio, y revisa la ficha de
              cada tomo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalogo" className="btn btn-primario btn-grande">
                Ver catálogo
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
    </>
  );
}
