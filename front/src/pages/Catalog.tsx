import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";

interface Product {
  id: string;
  sku: string;
  title: string;
  author: string | null;
  price: number;
  cover_url: string | null;
  category: { name: string } | null;
  inventory_quantity: number;
  inventory_reserved: number;
  rating_avg: number | null;
  reviews_count: number;
}

const SORTS: Array<[string, string]> = [
  ["newest", "Novedades"],
  ["price_asc", "Menor precio"],
  ["price_desc", "Mayor precio"],
  ["title", "Título A-Z"],
];

export default function Catalog() {
  const [sort, setSort] = useState("newest");

  const { data, isLoading, error } = useQuery({
    queryKey: ["products", sort],
    queryFn: async () => {
      const res = await api.get("/products", { params: { sort } });
      return res.data.items as Product[];
    },
  });

  if (isLoading) return <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 p-6">{[...Array(8)].map((_, i) => <ProductSkeleton key={i} />)}</div>;
  if (error) return <div className="p-6 text-center text-red-600">Error cargando productos</div>;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold">Catálogo</h1>
        <label className="text-sm text-gray-700">
          Ordenar por
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ml-3 px-3 py-1.5 border border-gray-300 rounded-lg"
          >
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.map((p) => {
          const stock = p.inventory_quantity - p.inventory_reserved;
          return (
            <Link key={p.id} to={`/producto/${p.sku}`} className="group block">
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                {p.cover_url ? (
                  <img src={p.cover_url} alt={p.title} className="w-full h-64 object-cover" />
                ) : (
                  <div className="w-full h-64 bg-gray-100 flex items-center justify-center text-gray-400">
                    Sin imagen
                  </div>
                )}
                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-1">{p.category?.name || "Sin categoría"}</p>
                  <h3 className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                    {p.title}
                  </h3>
                  {p.author && <p className="text-sm text-gray-500 mt-1">{p.author}</p>}
                  {p.rating_avg != null && (
                    <p className="text-sm text-amber-600 mt-1">
                      ⭐ {p.rating_avg.toFixed(1)} ({p.reviews_count})
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-lg font-bold text-indigo-600">${Number(p.price).toLocaleString("es-CL")}</p>
                    {stock === 0 ? (
                      <span className="text-xs text-red-600 font-medium">Agotado</span>
                    ) : stock <= 3 ? (
                      <span className="text-xs text-amber-600">Últimas {stock}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {(!data || data.length === 0) && <p className="text-center text-gray-500 py-12">No hay productos disponibles</p>}
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="w-full h-64 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-3 bg-gray-200 rounded w-1/4" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-6 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  );
}
