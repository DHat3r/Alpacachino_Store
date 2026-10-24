import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";

/* ── Tipos ─────────────────────────────────────────────────── */

interface Dashboard {
  total_products: number;
  total_orders: number;
  pending_orders: number;
  paid_orders: number;
  revenue_this_month: number;
  low_stock_alerts: number;
}

interface LowStockItem {
  product_id: string;
  sku: string;
  title: string;
  available: number;
  quantity: number;
  reserved: number;
}

interface AdminOrder {
  id: number;
  user_id: number;
  status: string;
  total: number;
  created_at: string;
  items: Array<{ id: number; product_id: string; quantity: number; unit_price: number }>;
}

interface AdminUser {
  id: number;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

type Tab = "resumen" | "inventario" | "pedidos" | "usuarios";

const ORDER_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "shipped",
  "delivered",
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-800",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-purple-100 text-purple-800",
};

const PAGE_SIZE = 20;

export default function Admin() {
  const [tab, setTab] = useState<Tab>("resumen");

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "resumen", label: "Resumen" },
    { id: "inventario", label: "Inventario" },
    { id: "pedidos", label: "Pedidos" },
    { id: "usuarios", label: "Usuarios" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="text-xl font-bold text-indigo-600">
              🦙 AlpacachinoStore
            </Link>
            <Link to="/" className="text-sm text-gray-600 hover:text-indigo-600">
              ← Volver a la tienda
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Panel de administración</h1>

        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "resumen" && <DashboardTab />}
        {tab === "inventario" && <InventoryTab />}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "usuarios" && <UsersTab />}
      </main>
    </div>
  );
}

/* ── Resumen ───────────────────────────────────────────────── */

function DashboardTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const res = await api.get("/admin/dashboard");
      return res.data as Dashboard;
    },
  });

  if (isLoading) return <p className="text-gray-600">Cargando indicadores...</p>;
  if (error || !data) return <p className="text-red-600">Error cargando los indicadores</p>;

  const cards = [
    { label: "Productos activos", value: data.total_products, accent: "text-indigo-600" },
    { label: "Pedidos totales", value: data.total_orders, accent: "text-gray-900" },
    { label: "Pedidos pendientes", value: data.pending_orders, accent: "text-yellow-600" },
    { label: "Pedidos pagados", value: data.paid_orders, accent: "text-green-600" },
    {
      label: "Ingresos del mes",
      value: `$${Number(data.revenue_this_month).toLocaleString("es-CL")}`,
      accent: "text-green-700",
    },
    { label: "Alertas de stock", value: data.low_stock_alerts, accent: "text-red-600" },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm text-gray-500 mb-2">{c.label}</p>
          <p className={`text-3xl font-bold ${c.accent}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Inventario ────────────────────────────────────────────── */

function InventoryTab() {
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(5);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-low-stock", threshold],
    queryFn: async () => {
      const res = await api.get("/admin/inventory/low-stock", {
        params: { threshold },
      });
      return res.data as LowStockItem[];
    },
  });

  const adjust = useMutation({
    mutationFn: async (input: { productId: string; delta: number; reason: string }) => {
      const res = await api.patch(`/admin/inventory/${input.productId}`, null, {
        params: { delta: input.delta, reason: input.reason },
      });
      return res.data as { available: number; new_quantity: number };
    },
    onSuccess: (result) => {
      setFeedback(
        `Stock actualizado: quedan ${result.available} unidades disponibles (total ${result.new_quantity}).`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => setFeedback("No se pudo ajustar el stock."),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-gray-700">
          Umbral de stock bajo
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
            className="ml-3 w-20 px-2 py-1 border border-gray-300 rounded-md"
          />
        </label>
        {adjust.isPending && <span className="text-sm text-gray-500">Aplicando ajuste...</span>}
      </div>

      {feedback && (
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm rounded-lg px-4 py-3">
          {feedback}
        </div>
      )}

      {isLoading && <p className="text-gray-600">Cargando inventario...</p>}
      {error && <p className="text-red-600">Error cargando el inventario</p>}

      {!isLoading && !error && data && data.length === 0 && (
        <p className="text-gray-500">No hay productos bajo el umbral de {threshold} unidades.</p>
      )}

      {data && data.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Producto</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-right px-4 py-3 font-medium">Reservado</th>
                <th className="text-right px-4 py-3 font-medium">Disponible</th>
                <th className="text-left px-4 py-3 font-medium">Ajustar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((item) => (
                <InventoryRow
                  key={item.product_id}
                  item={item}
                  disabled={adjust.isPending}
                  onAdjust={(delta, reason) =>
                    adjust.mutate({ productId: item.product_id, delta, reason })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InventoryRow({
  item,
  disabled,
  onAdjust,
}: {
  item: LowStockItem;
  disabled: boolean;
  onAdjust: (delta: number, reason: string) => void;
}) {
  const [delta, setDelta] = useState(10);
  const [reason, setReason] = useState("restock");

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-gray-900">{item.title}</td>
      <td className="px-4 py-3 text-gray-500">{item.sku}</td>
      <td className="px-4 py-3 text-right">{item.quantity}</td>
      <td className="px-4 py-3 text-right">{item.reserved}</td>
      <td
        className={`px-4 py-3 text-right font-semibold ${
          item.available <= 0 ? "text-red-600" : "text-gray-900"
        }`}
      >
        {item.available}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value) || 0)}
            className="w-20 px-2 py-1 border border-gray-300 rounded-md"
            aria-label={`Cantidad para ajustar ${item.title}`}
          />
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-md"
            aria-label={`Motivo del ajuste de ${item.title}`}
          >
            <option value="restock">Reposición</option>
            <option value="adjustment">Ajuste</option>
          </select>
          <button
            onClick={() => onAdjust(delta, reason)}
            disabled={disabled || delta === 0}
            className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-xs font-medium"
          >
            Aplicar
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Pedidos ───────────────────────────────────────────────── */

function OrdersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-orders", page, status],
    queryFn: async () => {
      const res = await api.get("/orders/admin/all", {
        params: { page, size: PAGE_SIZE, ...(status ? { status } : {}) },
      });
      return res.data as Page<AdminOrder>;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: { orderId: number; newStatus: string }) => {
      const res = await api.patch(`/orders/admin/${input.orderId}/status`, null, {
        params: { new_status: input.newStatus },
      });
      return res.data as AdminOrder;
    },
    onSuccess: (order) => {
      setFeedback(`Pedido #${order.id} actualizado a "${order.status}".`);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin-low-stock"] });
    },
    onError: () => setFeedback("No se pudo actualizar el pedido."),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm text-gray-700">
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="ml-3 px-2 py-1 border border-gray-300 rounded-md"
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-gray-500">
          {data ? `${data.total} pedido(s)` : ""}
        </span>
      </div>

      {feedback && (
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm rounded-lg px-4 py-3">
          {feedback}
        </div>
      )}

      {isLoading && <p className="text-gray-600">Cargando pedidos...</p>}
      {error && <p className="text-red-600">Error cargando los pedidos</p>}
      {!isLoading && !error && data?.items.length === 0 && (
        <p className="text-gray-500">No hay pedidos con ese filtro.</p>
      )}

      {data && data.items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Pedido</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-right px-4 py-3 font-medium">Ítems</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Cambiar a</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/pedido/${order.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      #{order.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">Usuario {order.user_id}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(order.created_at).toLocaleString("es-CL")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.items.reduce((acc, i) => acc + i.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${Number(order.total).toLocaleString("es-CL")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={order.status}
                      disabled={updateStatus.isPending}
                      onChange={(e) => {
                        if (e.target.value !== order.status) {
                          updateStatus.mutate({ orderId: order.id, newStatus: e.target.value });
                        }
                      }}
                      className="px-2 py-1 border border-gray-300 rounded-md"
                      aria-label={`Cambiar estado del pedido ${order.id}`}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <Pagination
          page={data.page}
          totalPages={totalPages}
          onChange={setPage}
        />
      )}
    </div>
  );
}

/* ── Usuarios ──────────────────────────────────────────────── */

function UsersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const currentUser = useAuth((s) => s.user);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users", page, role],
    queryFn: async () => {
      const res = await api.get("/admin/users", {
        params: { page, size: PAGE_SIZE, ...(role ? { role } : {}) },
      });
      return res.data as Page<AdminUser>;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const changeRole = useMutation({
    mutationFn: async (input: { userId: number; newRole: string }) => {
      const res = await api.patch(`/admin/users/${input.userId}/role`, null, {
        params: { new_role: input.newRole },
      });
      return res.data as { id: number; role: string };
    },
    onSuccess: (user) => {
      setFeedback(`Rol del usuario #${user.id} actualizado a "${user.role}".`);
      refresh();
    },
    onError: () => setFeedback("No se pudo cambiar el rol (¿es el admin principal?)."),
  });

  const toggleActive = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.patch(`/admin/users/${userId}/toggle-active`);
      return res.data as { id: number; is_active: boolean };
    },
    onSuccess: (user) => {
      setFeedback(
        `Usuario #${user.id} ${user.is_active ? "activado" : "desactivado"}.`
      );
      refresh();
    },
    onError: () => setFeedback("No se pudo cambiar el estado del usuario."),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm text-gray-700">
          Rol
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="ml-3 px-2 py-1 border border-gray-300 rounded-md"
          >
            <option value="">Todos</option>
            <option value="customer">Cliente</option>
            <option value="moderator">Moderador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <span className="text-sm text-gray-500">{data ? `${data.total} usuario(s)` : ""}</span>
      </div>

      {feedback && (
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm rounded-lg px-4 py-3">
          {feedback}
        </div>
      )}

      {isLoading && <p className="text-gray-600">Cargando usuarios...</p>}
      {error && <p className="text-red-600">Error cargando los usuarios</p>}

      {data && data.items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 font-medium">Correo</th>
                <th className="text-left px-4 py-3 font-medium">Registro</th>
                <th className="text-left px-4 py-3 font-medium">Último acceso</th>
                <th className="text-left px-4 py-3 font-medium">Rol</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((user) => {
                const isSelf = currentUser?.id === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {user.username}
                      {isSelf && <span className="ml-2 text-xs text-indigo-600">(tú)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(user.created_at).toLocaleDateString("es-CL")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {user.last_login
                        ? new Date(user.last_login).toLocaleString("es-CL")
                        : "Nunca"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        disabled={changeRole.isPending || user.role === "admin"}
                        onChange={(e) =>
                          changeRole.mutate({ userId: user.id, newRole: e.target.value })
                        }
                        className="px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-100"
                        aria-label={`Rol de ${user.username}`}
                      >
                        <option value="customer">Cliente</option>
                        <option value="moderator">Moderador</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {user.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive.mutate(user.id)}
                        disabled={toggleActive.isPending || isSelf}
                        title={isSelf ? "No puedes desactivar tu propia cuenta" : undefined}
                        className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 text-xs font-medium"
                      >
                        {user.is_active ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <Pagination page={data.page} totalPages={totalPages} onChange={setPage} />
      )}
    </div>
  );
}

/* ── Utilidades ────────────────────────────────────────────── */

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
      >
        Anterior
      </button>
      <span className="text-sm text-gray-600">
        Página {page} de {totalPages}
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
      >
        Siguiente
      </button>
    </div>
  );
}
