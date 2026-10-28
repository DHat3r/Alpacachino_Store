import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { textoEstado } from "../components/ui";
import { clp, fechaHora } from "../lib/format";
import CategoriasTab from "./admin/CategoriasTab";
import ModeracionTab from "./admin/ModeracionTab";
import ProductosTab from "./admin/ProductosTab";

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

interface Health {
  status: string;
  database: string;
  version: string;
  keepalive: {
    enabled: boolean;
    interval_seconds: number;
    checks: number;
    failures: number;
    last_check_at: string | null;
    last_ok_at: string | null;
    last_error: string | null;
    stock: { products: number; available: number; inconsistent: number };
    supabase: {
      configured: boolean;
      ok: boolean | null;
      latency_ms: number | null;
      last_check_at: string | null;
      last_error: string | null;
    };
  };
}

type Tab =
  | "resumen"
  | "productos"
  | "categorias"
  | "inventario"
  | "pedidos"
  | "moderacion"
  | "usuarios";

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
  pending: "bg-durazno-tenue text-durazno-hondo",
  paid: "bg-exito-tenue text-exito",
  failed: "bg-alerta-tenue text-alerta",
  expired: "bg-nube-hondo text-tinta-suave",
  cancelled: "bg-nube-hondo text-tinta-suave",
  shipped: "bg-morado-tenue text-morado-texto",
  delivered: "bg-exito-tenue text-exito",
};

/**
 * Transiciones que acepta el backend (app/services/orders.py).
 * El selector solo ofrece estas: antes mostraba los 7 estados y la API
 * rechazaba la mayoría con un 400.
 */
const TRANSICIONES: Record<string, string[]> = {
  pending: ["paid", "failed", "cancelled", "expired"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  expired: [],
  failed: [],
};

const PAGE_SIZE = 20;

export default function Admin() {
  const [tab, setTab] = useState<Tab>("resumen");

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "resumen", label: "Resumen" },
    { id: "productos", label: "Productos" },
    { id: "categorias", label: "Categorías" },
    { id: "inventario", label: "Inventario" },
    { id: "pedidos", label: "Pedidos" },
    { id: "moderacion", label: "Moderación" },
    { id: "usuarios", label: "Usuarios" },
  ];

  return (
    <div className="contenedor py-10">
      <div>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          Panel de administración
        </h1>

        <div className="mb-8 mt-6 flex flex-wrap gap-2 border-b border-humo">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t.id
                  ? "border-morado text-morado-texto"
                  : "border-transparent text-tinta-suave hover:text-tinta"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "resumen" && <DashboardTab />}
        {tab === "productos" && <ProductosTab />}
        {tab === "categorias" && <CategoriasTab />}
        {tab === "inventario" && <InventoryTab />}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "moderacion" && <ModeracionTab />}
        {tab === "usuarios" && <UsersTab />}
      </div>
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

  if (isLoading) return <p className="text-tinta-suave">Cargando indicadores...</p>;
  if (error || !data) return <p className="text-alerta">Error cargando los indicadores</p>;

  const cards = [
    { label: "Productos activos", value: data.total_products, accent: "text-morado-texto" },
    { label: "Pedidos totales", value: data.total_orders, accent: "text-tinta" },
    { label: "Pedidos pendientes", value: data.pending_orders, accent: "text-durazno-hondo" },
    { label: "Pedidos pagados", value: data.paid_orders, accent: "text-exito" },
    {
      label: "Ingresos del mes",
      value: clp(data.revenue_this_month),
      accent: "text-exito",
    },
    { label: "Alertas de stock", value: data.low_stock_alerts, accent: "text-alerta" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="panel p-6">
            <p className="text-sm text-tinta-suave mb-2">{c.label}</p>
            <p className={`text-3xl font-bold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <SystemStatus />
    </div>
  );
}

/** Estado del sistema, refrescado cada 5 s (latido de base/Supabase). */
function SystemStatus() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await api.get("/health");
      return res.data as Health;
    },
    refetchInterval: 5000,
  });

  if (isLoading) return <p className="text-sm text-tinta-suave">Consultando estado del sistema...</p>;
  if (error || !data) return <p className="text-sm text-alerta">No se pudo consultar /api/health</p>;

  const ka = data.keepalive;
  const sb = ka.supabase;
  const sbLabel = !sb.configured
    ? "No configurado"
    : sb.ok === null
      ? "Sin datos"
      : sb.ok
        ? `OK · ${sb.latency_ms ?? "?"} ms`
        : "Error";
  const sbColor = !sb.configured
    ? "text-tinta-suave"
    : sb.ok
      ? "text-exito"
      : sb.ok === false
        ? "text-alerta"
        : "text-tinta-suave";

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-tinta">Estado del sistema</h3>
        <span className="text-xs text-tinta-suave/60">
          Latido cada {ka.interval_seconds >= 60 ? `${Math.round(ka.interval_seconds / 60)} min` : `${ka.interval_seconds} s`} · actualizado{" "}
          {ka.last_check_at ? new Date(ka.last_check_at).toLocaleTimeString("es-CL") : "—"}
        </span>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <dt className="text-tinta-suave">API</dt>
          <dd className={`font-semibold ${data.status === "ok" ? "text-exito" : "text-durazno-hondo"}`}>
            {data.status}
          </dd>
        </div>
        <div>
          <dt className="text-tinta-suave">Base de datos</dt>
          <dd className={`font-semibold ${data.database === "ok" ? "text-exito" : "text-alerta"}`}>
            {data.database}
          </dd>
        </div>
        <div>
          <dt className="text-tinta-suave">Supabase</dt>
          <dd className={`font-semibold ${sbColor}`}>{sbLabel}</dd>
          {sb.last_error && <p className="text-xs text-tinta-suave/60 mt-1">{sb.last_error}</p>}
        </div>
        <div>
          <dt className="text-tinta-suave">Stock disponible</dt>
          <dd className="font-semibold text-tinta">
            {ka.stock.available} u. en {ka.stock.products} producto(s)
          </dd>
        </div>
      </dl>

      {ka.failures > 0 && (
        <p className="mt-4 text-xs text-alerta">
          {ka.failures} latido(s) fallido(s) de {ka.checks}. Último error: {ka.last_error}
        </p>
      )}
    </div>
  );
}

/* ── Inventario ────────────────────────────────────────────── */

function InventoryTab() {
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(5);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ campo: CampoInventario; asc: boolean }>({
    campo: "available",
    asc: true,
  });

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
      return res.data as { available: number; new_quantity: number; reserved: number };
    },
    onSuccess: (result) => {
      setFeedback(
        `Stock actualizado: quedan ${result.available} unidades disponibles (total en bodega ${
          result.new_quantity + result.reserved
        }).`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => setFeedback("No se pudo ajustar el stock."),
  });

  // quantity ya excluye lo reservado: el total en bodega es quantity + reserved.
  const filas = data
    ? data.map((i) => ({ ...i, total: i.quantity + i.reserved })).sort((a, b) => {
        const va = a[orden.campo];
        const vb = b[orden.campo];
        const cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
        return orden.asc ? cmp : -cmp;
      })
    : [];

  const ordenarPor = (campo: CampoInventario) =>
    setOrden((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: true }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-tinta-suave">
          Umbral de stock bajo
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
            className="ml-3 w-20 px-2 py-1 border border-humo rounded-md"
          />
        </label>
        {adjust.isPending && <span className="text-sm text-tinta-suave">Aplicando ajuste...</span>}
      </div>

      {feedback && (
        <div className="bg-morado-tenue text-morado-hondo text-sm rounded-lg px-4 py-3">
          {feedback}
        </div>
      )}

      {isLoading && <p className="text-tinta-suave">Cargando inventario...</p>}
      {error && <p className="text-alerta">Error cargando el inventario</p>}

      {!isLoading && !error && data && data.length === 0 && (
        <p className="text-tinta-suave">No hay productos bajo el umbral de {threshold} unidades.</p>
      )}

      {data && data.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-papel text-tinta-suave">
              <tr>
                <EncabezadoOrden campo="title" texto="Producto" orden={orden} onOrdenar={ordenarPor} />
                <EncabezadoOrden campo="sku" texto="SKU" orden={orden} onOrdenar={ordenarPor} />
                <EncabezadoOrden campo="total" texto="Total" orden={orden} onOrdenar={ordenarPor} derecha />
                <EncabezadoOrden campo="reserved" texto="Reservado" orden={orden} onOrdenar={ordenarPor} derecha />
                <EncabezadoOrden campo="available" texto="Disponible" orden={orden} onOrdenar={ordenarPor} derecha />
                <th className="text-left px-4 py-3 font-medium">Ajustar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-humo">
              {filas.map((item) => (
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

type CampoInventario = "title" | "sku" | "total" | "reserved" | "available";

/** Encabezado de columna que ordena al hacer clic (vuelve a hacer clic para invertir). */
function EncabezadoOrden({
  campo,
  texto,
  orden,
  onOrdenar,
  derecha = false,
}: {
  campo: CampoInventario;
  texto: string;
  orden: { campo: CampoInventario; asc: boolean };
  onOrdenar: (campo: CampoInventario) => void;
  derecha?: boolean;
}) {
  const activo = orden.campo === campo;
  return (
    <th
      className={`px-4 py-3 font-medium ${derecha ? "text-right" : "text-left"}`}
      aria-sort={activo ? (orden.asc ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-tinta ${
          activo ? "text-morado-texto" : ""
        }`}
        title={`Ordenar por ${texto.toLowerCase()}`}
      >
        {texto}
        <span aria-hidden className={`text-xs ${activo ? "" : "opacity-30"}`}>
          {activo ? (orden.asc ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
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
      <td className="px-4 py-3 font-medium text-tinta">{item.title}</td>
      <td className="px-4 py-3 text-tinta-suave">{item.sku}</td>
      <td className="px-4 py-3 text-right">{item.quantity + item.reserved}</td>
      <td className="px-4 py-3 text-right">{item.reserved}</td>
      <td
        className={`px-4 py-3 text-right font-semibold ${
          item.available <= 0 ? "text-alerta" : "text-tinta"
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
            className="w-20 px-2 py-1 border border-humo rounded-md"
            aria-label={`Cantidad para ajustar ${item.title}`}
          />
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="px-2 py-1 border border-humo rounded-md"
            aria-label={`Motivo del ajuste de ${item.title}`}
          >
            <option value="restock">Reposición</option>
            <option value="adjustment">Ajuste</option>
          </select>
          <button
            onClick={() => onAdjust(delta, reason)}
            disabled={disabled || delta === 0}
            className="px-3 py-1 bg-morado text-white rounded-md hover:bg-morado-hondo disabled:opacity-50 text-xs font-medium"
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
        <label className="text-sm text-tinta-suave">
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="ml-3 px-2 py-1 border border-humo rounded-md"
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {textoEstado(s)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-tinta-suave">
          {data ? `${data.total} pedido(s)` : ""}
        </span>
      </div>

      {feedback && (
        <div className="bg-morado-tenue text-morado-hondo text-sm rounded-lg px-4 py-3">
          {feedback}
        </div>
      )}

      {isLoading && <p className="text-tinta-suave">Cargando pedidos...</p>}
      {error && <p className="text-alerta">Error cargando los pedidos</p>}
      {!isLoading && !error && data?.items.length === 0 && (
        <p className="text-tinta-suave">No hay pedidos con ese filtro.</p>
      )}

      {data && data.items.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-papel text-tinta-suave">
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
            <tbody className="divide-y divide-humo">
              {data.items.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/pedido/${order.id}`}
                      className="font-medium text-morado-texto hover:text-morado-hondo"
                    >
                      #{order.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tinta-suave">Usuario {order.user_id}</td>
                  <td className="px-4 py-3 text-tinta-suave">
                    {fechaHora(order.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.items.reduce((acc, i) => acc + i.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {clp(order.total)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[order.status] || "bg-nube-hondo text-tinta-suave"
                      }`}
                    >
                      {textoEstado(order.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(TRANSICIONES[order.status] ?? []).length === 0 ? (
                      <span className="text-xs text-tinta-suave">Estado final</span>
                    ) : (
                      <select
                        value={order.status}
                        disabled={updateStatus.isPending}
                        onChange={(e) => {
                          if (e.target.value !== order.status) {
                            updateStatus.mutate({
                              orderId: order.id,
                              newStatus: e.target.value,
                            });
                          }
                        }}
                        className="rounded-lg border border-humo px-2 py-1"
                        aria-label={`Cambiar estado del pedido ${order.id}`}
                      >
                        <option value={order.status}>{textoEstado(order.status)}</option>
                        {(TRANSICIONES[order.status] ?? []).map((s) => (
                          <option key={s} value={s}>
                            Pasar a: {textoEstado(s)}
                          </option>
                        ))}
                      </select>
                    )}
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
        <label className="text-sm text-tinta-suave">
          Rol
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="ml-3 px-2 py-1 border border-humo rounded-md"
          >
            <option value="">Todos</option>
            <option value="customer">Cliente</option>
            <option value="moderator">Moderador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <span className="text-sm text-tinta-suave">{data ? `${data.total} usuario(s)` : ""}</span>
      </div>

      {feedback && (
        <div className="bg-morado-tenue text-morado-hondo text-sm rounded-lg px-4 py-3">
          {feedback}
        </div>
      )}

      {isLoading && <p className="text-tinta-suave">Cargando usuarios...</p>}
      {error && <p className="text-alerta">Error cargando los usuarios</p>}

      {data && data.items.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-papel text-tinta-suave">
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
            <tbody className="divide-y divide-humo">
              {data.items.map((user) => {
                const isSelf = currentUser?.id === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-tinta">
                      {user.username}
                      {isSelf && <span className="ml-2 text-xs text-morado-texto">(tú)</span>}
                    </td>
                    <td className="px-4 py-3 text-tinta-suave">{user.email}</td>
                    <td className="px-4 py-3 text-tinta-suave">
                      {new Date(user.created_at).toLocaleDateString("es-CL")}
                    </td>
                    <td className="px-4 py-3 text-tinta-suave">
                      {user.last_login
                        ? fechaHora(user.last_login)
                        : "Nunca"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        disabled={changeRole.isPending || user.role === "admin"}
                        onChange={(e) =>
                          changeRole.mutate({ userId: user.id, newRole: e.target.value })
                        }
                        className="px-2 py-1 border border-humo rounded-md disabled:bg-nube-hondo"
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
                            ? "bg-exito-tenue text-exito"
                            : "bg-alerta-tenue text-alerta"
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
                        className="px-3 py-1 border border-humo rounded-md hover:bg-papel disabled:opacity-50 text-xs font-medium"
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
        className="px-4 py-2 text-sm border border-humo rounded-md hover:bg-papel disabled:opacity-50"
      >
        Anterior
      </button>
      <span className="text-sm text-tinta-suave">
        Página {page} de {totalPages}
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-4 py-2 text-sm border border-humo rounded-md hover:bg-papel disabled:opacity-50"
      >
        Siguiente
      </button>
    </div>
  );
}
