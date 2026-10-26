import { Link } from "react-router-dom";

import Alpaca from "./Alpaca";
import { clp } from "../lib/format";

export interface ProductoFicha {
  id: string;
  sku: string;
  title: string;
  author?: string | null;
  price: number;
  cover_url?: string | null;
  category?: { name: string } | null;
  inventory_quantity?: number;
  inventory_reserved?: number;
  available_stock?: number | null;
  rating_avg?: number | null;
  reviews_count?: number;
}

export function stockDisponible(p: ProductoFicha): number {
  if (typeof p.available_stock === "number") return p.available_stock;
  return (p.inventory_quantity ?? 0) - (p.inventory_reserved ?? 0);
}

/**
 * Ficha de producto. La portada lleva una faja morada con el precio, como el
 * obi de papel que trae un tomo japonés: es la pieza que identifica la tienda.
 */
export default function FichaProducto({ producto }: { producto: ProductoFicha }) {
  const stock = stockDisponible(producto);
  const agotado = stock <= 0;

  return (
    <Link to={`/producto/${producto.sku}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-ficha border border-humo bg-papel transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-levanta">
        {producto.cover_url ? (
          <img
            src={producto.cover_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-papel-hondo px-4 pb-10 text-center">
            <Alpaca className="h-10 w-10 text-humo" />
            <span className="line-clamp-3 font-display text-sm font-extrabold leading-tight text-tinta-suave">
              {producto.title}
            </span>
          </div>
        )}

        {agotado && (
          <div className="absolute inset-0 flex items-start justify-start bg-nocturno/45 p-3">
            <span className="rounded-full bg-superficie px-2.5 py-1 text-xs font-bold">
              Sin stock
            </span>
          </div>
        )}

        <div className="obi">
          <span>{clp(producto.price)}</span>
          {!agotado && stock <= 3 && (
            <span className="pb-0.5 font-sans text-[11px] font-semibold text-lila">
              Quedan {stock}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        {producto.category?.name && (
          <p className="text-xs font-medium text-tinta-suave">{producto.category.name}</p>
        )}
        <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-morado-texto">
          {producto.title}
        </h3>
        {producto.author && (
          <p className="mt-0.5 line-clamp-1 text-sm text-tinta-suave">{producto.author}</p>
        )}
        {producto.rating_avg != null && (
          <p className="mt-1 text-sm">
            <span aria-hidden className="text-durazno">
              ★
            </span>{" "}
            <span className="font-semibold">{producto.rating_avg.toFixed(1)}</span>{" "}
            <span className="text-tinta-suave">({producto.reviews_count ?? 0})</span>
          </p>
        )}
      </div>
    </Link>
  );
}
