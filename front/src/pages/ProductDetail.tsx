import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "../store/cart";
import { api } from "../api/client";
import { useState } from "react";

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
  rating_avg: number | null;
  reviews_count: number;
}

export default function ProductDetail() {
  const { sku } = useParams<{ sku: string }>();
  const navigate = useNavigate();
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product", sku],
    queryFn: async () => {
      const res = await api.get(`/products/${sku}`);
      return res.data as Product;
    },
    enabled: !!sku,
  });

  const handleAddToCart = () => {
    if (!product) return;
    add({
      productId: product.id,
      sku: product.sku,
      title: product.title,
      price: Number(product.price),
      coverUrl: product.cover_url || undefined,
    });
    alert("Agregado al carrito");
  };

  if (isLoading) return <div className="p-6 animate-pulse">Cargando...</div>;
  if (error || !product) return <div className="p-6 text-center text-red-600">Producto no encontrado</div>;

  const stock = product.inventory_quantity - product.inventory_reserved;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <nav className="mb-6 text-sm text-gray-500">
        <a href="/catalogo" className="hover:text-indigo-600">Catálogo</a> / {product.title}
      </nav>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          {product.cover_url ? (
            <img src={product.cover_url} alt={product.title} className="w-full rounded-lg shadow-sm" />
          ) : (
            <div className="w-full aspect-[3/4] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              Sin imagen
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-gray-500 mb-1">{product.category?.name || "Sin categoría"}</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.title}</h1>
          {product.rating_avg != null && (
            <a
              href={`/foro?producto=${product.id}`}
              className="inline-block text-amber-600 hover:text-amber-700 mb-2"
            >
              ⭐ {product.rating_avg.toFixed(1)} · {product.reviews_count} reseña
              {product.reviews_count === 1 ? "" : "s"}
            </a>
          )}
          {product.author && <p className="text-gray-600 mb-1">Autor: {product.author}</p>}
          {product.publisher && <p className="text-gray-600 mb-1">Editorial: {product.publisher}</p>}
          {product.isbn && <p className="text-gray-600 mb-4">ISBN: {product.isbn}</p>}

          <p className="text-3xl font-bold text-indigo-600 mb-4">
            ${Number(product.price).toLocaleString("es-CL")}
          </p>

          <p className="text-sm text-gray-500 mb-4">
            Stock disponible: <span className={stock > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
              {stock}
            </span>
          </p>

          {product.description && (
            <div className="prose max-w-none mb-6 text-gray-700">
              <p>{product.description}</p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center border border-gray-300 rounded">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-3 py-2 hover:bg-gray-100"
              >
                -
              </button>
              <span className="px-4 py-2 text-center w-12">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="px-3 py-2 hover:bg-gray-100"
              >
                +
              </button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={stock === 0}
              className="flex-1 py-3 px-6 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {stock === 0 ? "Agotado" : "Agregar al carrito"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}