import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import { api } from "../api/client";
import { useConfig } from "../api/config";
import { useState } from "react";

interface CheckoutResponse {
  order_id: number;
  payment_provider: string;
  payment_url: string | null;
  payment_token: string | null;
  payment_instructions: unknown;
}

/** Webpay exige enviar el token por POST de formulario, no por redirección. */
function submitWebpayForm(url: string, token: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "token_ws";
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana",
  "O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes",
];

export default function Cart() {
  const { items, remove, setQty, clear, total, itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    shipping_name: "",
    shipping_phone: "",
    shipping_region: "Metropolitana",
    shipping_comuna: "",
    shipping_address: "",
    shipping_notes: "",
  });

  const shippingCost = config?.shipping_cost ?? 3500;
  const freeFrom = config?.free_shipping_from ?? 30000;
  const shipping = total() >= freeFrom ? 0 : shippingCost;

  const update = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleCheckout = async () => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    setError("");

    if (form.shipping_address.trim().length < 10) {
      setError("Ingresa una dirección de envío completa (calle, número y comuna).");
      return;
    }
    if (form.shipping_phone.trim().length < 6) {
      setError("Ingresa un teléfono de contacto válido.");
      return;
    }
    if (items.length === 0) return;

    setLoading(true);
    try {
      const res = await api.post<CheckoutResponse>("/orders/checkout", {
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        ...form,
      });

      const data = res.data;
      clear();

      if (data.payment_provider === "webpay" && data.payment_url && data.payment_token) {
        submitWebpayForm(data.payment_url, data.payment_token);
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      // Sin pasarela (pago manual o no configurada): el pedido ya está reservado.
      navigate(`/pedido/${data.order_id}`, {
        state: { paymentInstructions: data.payment_instructions },
      });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No pudimos crear el pedido.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Tu carrito está vacío</h2>
        <Link to="/catalogo" className="text-indigo-600 hover:text-indigo-500">
          Ir a comprar
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Carrito ({itemCount()})</h1>

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.productId} className="flex gap-4 bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt={item.title} className="w-24 h-32 object-cover rounded" />
            ) : (
              <div className="w-24 h-32 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                Sin imagen
              </div>
            )}
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-500">${Number(item.price).toLocaleString("es-CL")} c/u</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setQty(item.productId, item.quantity - 1)}
                  className="w-8 h-8 border border-gray-300 rounded hover:bg-gray-100"
                >
                  -
                </button>
                <span className="w-12 text-center">{item.quantity}</span>
                <button
                  onClick={() => setQty(item.productId, item.quantity + 1)}
                  className="w-8 h-8 border border-gray-300 rounded hover:bg-gray-100"
                >
                  +
                </button>
                <span className="ml-2 font-medium">
                  ${(Number(item.price) * item.quantity).toLocaleString("es-CL")}
                </span>
              </div>
            </div>
            <button
              onClick={() => remove(item.productId)}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white p-6 rounded-lg border border-gray-100 shadow-sm">
        <div className="flex justify-between mb-4">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium">${total().toLocaleString("es-CL")}</span>
        </div>
        <div className="flex justify-between mb-4">
          <span className="text-gray-600">Envío</span>
          <span className="font-medium">
            {shipping === 0 ? "Gratis" : `$${shipping.toLocaleString("es-CL")}`}
          </span>
        </div>
        <div className="border-t pt-4 flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>${(total() + shipping).toLocaleString("es-CL")}</span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Nombre y apellido</span>
            <input
              value={form.shipping_name}
              onChange={update("shipping_name")}
              className="mt-1 w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ana Pérez"
              autoComplete="name"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Teléfono</span>
            <input
              value={form.shipping_phone}
              onChange={update("shipping_phone")}
              className="mt-1 w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="+56 9 1234 5678"
              autoComplete="tel"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Región</span>
            <select
              value={form.shipping_region}
              onChange={update("shipping_region")}
              className="mt-1 w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {REGIONES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Comuna</span>
            <input
              value={form.shipping_comuna}
              onChange={update("shipping_comuna")}
              className="mt-1 w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Providencia"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Dirección de envío</span>
            <textarea
              value={form.shipping_address}
              onChange={update("shipping_address")}
              rows={2}
              className="mt-1 w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Calle, número, departamento, código postal..."
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Notas para el reparto (opcional)</span>
            <input
              value={form.shipping_notes}
              onChange={update("shipping_notes")}
              className="mt-1 w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ej.: dejar con conserje"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="mt-4 bg-red-50 text-red-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="mt-6 w-full py-3 px-6 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? "Procesando..." : "Confirmar pedido"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-500">
          {total() < freeFrom && (
            <span>
              Envío gratis en compras sobre ${freeFrom.toLocaleString("es-CL")} (faltan $
              {(freeFrom - total()).toLocaleString("es-CL")})
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
