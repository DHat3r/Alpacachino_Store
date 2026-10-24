import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface Order {
  id: number;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  shipping_address: string | null;
  shipping_notes: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  items: Array<{
    id: number;
    product_id: string;
    quantity: number;
    unit_price: number;
  }>;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const res = await api.get(`/orders/${id}`);
      return res.data as Order;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error || !order) return <div className="p-6 text-center text-red-600">Pedido no encontrado</div>;

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Detalle del Pedido #{order.id}</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-800"}`}>
          {order.status}
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <h3 className="font-medium text-gray-900 mb-4">Productos</h3>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                    {item.product_id.slice(0, 8)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Producto {item.product_id.slice(0, 8)}</p>
                    <p className="text-sm text-gray-500">Cantidad: {item.quantity} x ${Number(item.unit_price).toLocaleString("es-CL")}</p>
                  </div>
                  <p className="font-medium text-right">${(Number(item.unit_price) * item.quantity).toLocaleString("es-CL")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <h3 className="font-medium text-gray-900 mb-4">Dirección de envío</h3>
            <p className="text-gray-600 whitespace-pre-line">{order.shipping_address || "No especificada"}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 p-4 h-fit">
          <h3 className="font-medium text-gray-900 mb-4">Resumen</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Subtotal</dt>
              <dd className="font-medium">${Number(order.subtotal).toLocaleString("es-CL")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Envío</dt>
              <dd className="font-medium">${Number(order.shipping).toLocaleString("es-CL")}</dd>
            </div>
            <div className="border-t pt-3 flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd>${Number(order.total).toLocaleString("es-CL")}</dd>
            </div>
          </dl>

          <div className="mt-6 pt-6 border-t space-y-2 text-sm text-gray-500">
            <p>Creado: {new Date(order.created_at).toLocaleString("es-CL")}</p>
            {order.paid_at && <p>Pagado: {new Date(order.paid_at).toLocaleString("es-CL")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}