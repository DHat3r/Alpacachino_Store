import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import { Cargando, Vacio } from "../components/ui";
import { api } from "../api/client";
import { clp } from "../lib/format";

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
}

export default function ProductDetail() {
  const { sku } = useParams<{ sku: string }>();

  const { data: producto, isLoading, error } = useQuery({
    queryKey: ["product", sku],
    queryFn: async () => {
      const res = await api.get(`/products/${sku}`);
      return res.data as Product;
    },
    enabled: !!sku,
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
      : producto.inventory_quantity;
  const agotado = stock <= 0;

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
              <span className="text-exito">Disponible</span>
            )}
          </p>

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
        </div>
      </div>
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
