import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import FichaProducto, { type ProductoFicha } from "../components/FichaProducto";
import { ErrorCarga, FichaSkeleton, Paginacion, Vacio } from "../components/ui";
import { api } from "../api/client";
import { plural } from "../lib/format";

interface Categoria {
  id: number;
  name: string;
  slug: string;
}

const ORDENES: Array<[string, string]> = [
  ["newest", "Novedades"],
  ["price_asc", "Menor precio"],
  ["price_desc", "Mayor precio"],
  ["title", "Título A–Z"],
];

const TAMANO = 12;

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoria = params.get("categoria") ?? "";
  const orden = params.get("orden") ?? "newest";
  const soloStock = params.get("stock") === "1";
  const pagina = Number(params.get("pagina") ?? 1);

  // Caja de búsqueda con rebote: no dispara una consulta por tecla.
  const [texto, setTexto] = useState(q);
  useEffect(() => setTexto(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (texto !== q) actualizar({ q: texto || null, pagina: null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  function actualizar(cambios: Record<string, string | null>) {
    const siguiente = new URLSearchParams(params);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null || valor === "") siguiente.delete(clave);
      else siguiente.set(clave, valor);
    }
    setParams(siguiente, { replace: true });
  }

  const { data: categorias } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => {
      const res = await api.get("/products/categories");
      return res.data as Categoria[];
    },
    staleTime: 1000 * 60 * 30,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["products", { q, categoria, orden, soloStock, pagina }],
    queryFn: async () => {
      const res = await api.get("/products", {
        params: {
          sort: orden,
          page: pagina,
          size: TAMANO,
          ...(q ? { q } : {}),
          ...(categoria ? { category: categoria } : {}),
          ...(soloStock ? { in_stock: true } : {}),
        },
      });
      return res.data as { items: ProductoFicha[]; total: number; page: number; size: number };
    },
    placeholderData: keepPreviousData,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const hayFiltros = Boolean(q || categoria || soloStock);

  return (
    <div className="contenedor py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Catálogo</h1>
        <p className="mt-2 text-tinta-suave">
          {data
            ? plural(data.total, "título disponible", "títulos disponibles")
            : "Cargando títulos…"}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <label htmlFor="buscar" className="etiqueta-campo">
              Buscar
            </label>
            <input
              id="buscar"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Título o autor"
              className="campo"
            />
          </div>

          <div>
            <h2 className="etiqueta-campo">Categoría</h2>
            <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-start">
              <BotonFiltro
                activo={!categoria}
                onClick={() => actualizar({ categoria: null, pagina: null })}
              >
                Todas
              </BotonFiltro>
              {categorias?.map((c) => (
                <BotonFiltro
                  key={c.id}
                  activo={categoria === c.slug}
                  onClick={() => actualizar({ categoria: c.slug, pagina: null })}
                >
                  {c.name}
                </BotonFiltro>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="orden" className="etiqueta-campo">
              Ordenar por
            </label>
            <select
              id="orden"
              value={orden}
              onChange={(e) => actualizar({ orden: e.target.value, pagina: null })}
              className="campo"
            >
              {ORDENES.map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={soloStock}
              onChange={(e) => actualizar({ stock: e.target.checked ? "1" : null, pagina: null })}
              className="h-4 w-4 rounded border-humo accent-morado"
            />
            Solo con stock
          </label>

          {hayFiltros && (
            <button
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="btn btn-fantasma -ml-2"
            >
              Limpiar filtros
            </button>
          )}
        </aside>

        <div>
          {error ? (
            <ErrorCarga />
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <FichaSkeleton key={i} />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div
                className={`grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 ${
                  isFetching ? "opacity-60 transition-opacity" : ""
                }`}
              >
                {data.items.map((p) => (
                  <FichaProducto key={p.id} producto={p} />
                ))}
              </div>
              <Paginacion
                pagina={pagina}
                totalPaginas={totalPaginas}
                onCambio={(p) => {
                  actualizar({ pagina: String(p) });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </>
          ) : (
            <Vacio
              titulo="No encontramos títulos con esos filtros"
              texto="Prueba con otra categoría o quita la búsqueda."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BotonFiltro({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        activo ? "bg-morado text-white" : "bg-white text-tinta-suave hover:bg-morado-tenue"
      }`}
    >
      {children}
    </button>
  );
}
