import { useParams, Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../api/client";
import { useConfig, type PaymentInstructions } from "../api/config";

interface OrderItem {
  id: number;
  product_id: string;
  sku: string | null;
  title: string | null;
  cover_url: string | null;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: number;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  shipping_address: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_region: string | null;
  shipping_comuna: string | null;
  shipping_notes: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  paid_at: string | null;
  items: OrderItem[];
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const [error, setError] = useState("");

  const { data: order, isLoading, error: queryError } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const res = await api.get(`/orders/${id}`);
      return res.data as Order;
    },
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/orders/${id}/cancel`);
      return res.data as Order;
    },
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No pudimos cancelar el pedido.");
    },
  });

  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (queryError || !order)
    return <div className="p-6 text-center text-red-600">Pedido no encontrado</div>;

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    expired: "bg-gray-100 text-gray-800",
    cancelled: "bg-gray-100 text-gray-800",
    shipped: "bg-blue-100 text-blue-800",
    delivered: "bg-purple-100 text-purple-800",
  };

  const instrucciones =
    (location.state as { paymentInstructions?: PaymentInstructions } | null)
      ?.paymentInstructions ??
    (order.status === "pending" ? config?.payment_instructions : null);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Detalle del Pedido #{order.id}</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-800"}`}>
          {order.status}
        </span>
      </div>

      {order.status === "pending" && (
        <div className="mb-6 bg-yellow-50 border border-yellow-100 rounded-lg p-4 text-sm text-yellow-800">
          Reservamos el stock de tu pedido
          {order.expires_at && (
            <> hasta el {new Date(order.expires_at).toLocaleString("es-CL")}</>
          )}
          {" "}— si no se confirma el pago, se liberará automáticamente.
        </div>
      )}

      {instrucciones && order.status === "pending" && (
        <div className="mb-6 bg-white border border-indigo-100 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-2">Datos para la transferencia</h2>
          <dl className="grid gap-2 sm:grid-cols-2 text-sm text-gray-700">
            {instrucciones.bank && (
              <div><dt className="text-gray-500">Banco</dt><dd>{instrucciones.bank}</dd></div>
            )}
            {instrucciones.account_type && (
              <div><dt className="text-gray-500">Tipo de cuenta</dt><dd>{instrucciones.account_type}</dd></div>
            )}
            {instrucciones.account_number && (
              <div><dt className="text-gray-500">Número</dt><dd>{instrucciones.account_number}</dd></div>
            )}
            {instrucciones.holder && (
              <div><dt className="text-gray-500">Titular</dt><dd>{instrucciones.holder}</dd></div>
            )}
            {instrucciones.rut && (
              <div><dt className="text-gray-500">RUT</dt><dd>{instrucciones.rut}</dd></div>
            )}
            {instrucciones.email && (
              <div><dt className="text-gray-500">Enviar comprobante</dt><dd>{instrucciones.email}</dd></div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Monto</dt>
              <dd className="text-lg font-semibold">${Number(order.total).toLocaleString("es-CL")}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-gray-600">{instrucciones.note}</p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <h3 className="font-medium text-gray-900 mb-4">Productos</h3>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4 items-center">
                  {item.cover_url ? (
                    <img
                      src={item.cover_url}
                      alt={item.title ?? "Portada"}
                      className="w-16 h-20 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                      Sin imagen
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.sku ? (
                        <Link to={`/producto/${item.sku}`} className="hover:text-indigo-600">
                          {item.title ?? `Producto ${item.product_id.slice(0, 8)}`}
                        </Link>
                      ) : (
                        item.title ?? `Producto ${item.product_id.slice(0, 8)}`
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      Cantidad: {item.quantity} x ${Number(item.unit_price).toLocaleString("es-CL")}
                    </p>
                  </div>
                  <p className="font-medium text-right">
                    ${(Number(item.unit_price) * item.quantity).toLocaleString("es-CL")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <h3 className="font-medium text-gray-900 mb-4">Datos de envío</h3>
            <div className="text-gray-600 space-y-1 text-sm">
              {order.shipping_name && <p>{order.shipping_name}</p>}
              {order.shipping_phone && <p>Teléfono: {order.shipping_phone}</p>}
              <p className="whitespace-pre-line">{order.shipping_address || "No especificada"}</p>
              {(order.shipping_comuna || order.shipping_region) && (
                <p>
                  {[order.shipping_comuna, order.shipping_region].filter(Boolean).join(", ")}
                </p>
              )}
              {order.shipping_notes && (
                <p className="text-gray-500">Notas: {order.shipping_notes}</p>
              )}
            </div>
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

          {order.status === "pending" && (
            <button
              onClick={() => {
                if (confirm("¿Cancelar este pedido y liberar el stock?")) {
                  cancelMutation.mutate();
                }
              }}
              disabled={cancelMutation.isPending}
              className="mt-6 w-full py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {cancelMutation.isPending ? "Cancelando..." : "Cancelar pedido"}
            </button>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
