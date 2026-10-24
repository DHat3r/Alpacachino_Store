import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { api } from "../api/client";

interface Order {
  id: number;
  status: string;
  total: number;
  created_at: string;
  items: Array<{
    id: number;
    product_id: string;
    quantity: number;
    unit_price: number;
  }>;
}

export default function MyOrders() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const res = await api.get("/orders");
      return res.data.items as Order[];
    },
    enabled: isAuthenticated(),
  });

  if (!isAuthenticated()) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Inicia sesión para ver tus pedidos</h2>
        <a href="/login" className="text-indigo-600 hover:text-indigo-500">Iniciar sesión</a>
      </div>
    );
  }

  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-center text-red-600">Error cargando pedidos</div>;

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    expired: "bg-gray-100 text-gray-800",
    cancelled: "bg-gray-100 text-gray-800",
    shipped: "bg-blue-100 text-blue-800",
    delivered: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Mis pedidos</h1>

      {(!data || data.length === 0) && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No tienes pedidos aún</p>
          <Link to="/catalogo" className="text-indigo-600 hover:text-indigo-500">
            Ir al catálogo
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {data?.map((order) => (
          <div key={order.id} className="bg-white rounded-lg border border-gray-100 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-3">
              <div>
                <span className="font-medium text-gray-900">Pedido #{order.id}</span>
                <span className="ml-3 text-sm">
                  {new Date(order.created_at).toLocaleDateString("es-CL")}
                </span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-800"}`}>
                {order.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
              <span>{order.items.length} producto(s)</span>
              <span>Total: ${Number(order.total).toLocaleString("es-CL")}</span>
            </div>
            <Link
              to={`/pedido/${order.id}`}
              className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
            >
              Ver detalles
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}