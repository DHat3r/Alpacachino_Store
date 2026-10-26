import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import { Aviso, Vacio } from "../components/ui";
import { api } from "../api/client";
import { useConfig } from "../api/config";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { clp, duracionReserva } from "../lib/format";

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

  const costoEnvio = config?.shipping_cost ?? 3500;
  const envioGratisDesde = config?.free_shipping_from ?? 30000;
  const envio = total() >= envioGratisDesde ? 0 : costoEnvio;

  const update =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const confirmar = async () => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    setError("");

    if (form.shipping_name.trim().length < 3) {
      setError("Escribe el nombre de quien recibe el pedido.");
      return;
    }
    if (form.shipping_phone.trim().length < 6) {
      setError("Ingresa un teléfono de contacto válido.");
      return;
    }
    if (form.shipping_comuna.trim().length < 3) {
      setError("Indica la comuna de despacho.");
      return;
    }
    if (form.shipping_address.trim().length < 10) {
      setError("Ingresa la dirección completa: calle, número y departamento si aplica.");
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

      // Sin pasarela (pago manual): el pedido ya quedó con el stock reservado.
      navigate(`/pedido/${data.order_id}`, {
        state: { paymentInstructions: data.payment_instructions },
      });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      setError(typeof detail === "string" ? detail : "No pudimos crear el pedido.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="contenedor py-16">
        <Vacio
          titulo="Tu carrito está vacío"
          texto="Cuando encuentres un tomo que te guste, agrégalo aquí y lo reservamos al confirmar."
          accion={{ a: "/catalogo", texto: "Ver catálogo" }}
        />
      </div>
    );
  }

  const falta = envioGratisDesde - total();

  return (
    <div className="contenedor py-10">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Carrito</h1>
      <p className="mt-2 text-tinta-suave">
        {itemCount()} {itemCount() === 1 ? "unidad lista" : "unidades listas"} para
        despachar
      </p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <ul className="panel divide-y divide-humo">
            {items.map((item) => (
              <li key={item.productId} className="flex gap-4 p-4">
                <Link
                  to={`/producto/${item.sku}`}
                  className="h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-humo bg-papel"
                >
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Alpaca className="h-8 w-8 text-humo" />
                    </span>
                  )}
                </Link>

                <div className="flex-1">
                  <Link
                    to={`/producto/${item.sku}`}
                    className="font-semibold hover:text-morado-texto"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-tinta-suave">
                    {clp(item.price)} por unidad
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center rounded-full border border-humo">
                      <button
                        onClick={() => setQty(item.productId, item.quantity - 1)}
                        className="px-3 py-1.5 leading-none hover:text-morado-texto"
                        aria-label={`Quitar una unidad de ${item.title}`}
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => setQty(item.productId, item.quantity + 1)}
                        className="px-3 py-1.5 leading-none hover:text-morado-texto"
                        aria-label={`Agregar una unidad de ${item.title}`}
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => remove(item.productId)}
                      className="text-sm font-medium text-tinta-suave hover:text-alerta"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                <p className="font-display text-lg font-extrabold">
                  {clp(Number(item.price) * item.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <section className="panel p-6">
            <h2 className="font-display text-xl font-extrabold">Datos de despacho</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="nombre" className="etiqueta-campo">
                  Nombre de quien recibe
                </label>
                <input
                  id="nombre"
                  value={form.shipping_name}
                  onChange={update("shipping_name")}
                  autoComplete="name"
                  className="campo"
                  placeholder="Ana Pérez"
                />
              </div>
              <div>
                <label htmlFor="telefono" className="etiqueta-campo">
                  Teléfono
                </label>
                <input
                  id="telefono"
                  value={form.shipping_phone}
                  onChange={update("shipping_phone")}
                  autoComplete="tel"
                  className="campo"
                  placeholder="+56 9 1234 5678"
                />
              </div>
              <div>
                <label htmlFor="region" className="etiqueta-campo">
                  Región
                </label>
                <select
                  id="region"
                  value={form.shipping_region}
                  onChange={update("shipping_region")}
                  className="campo"
                >
                  {REGIONES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="comuna" className="etiqueta-campo">
                  Comuna
                </label>
                <input
                  id="comuna"
                  value={form.shipping_comuna}
                  onChange={update("shipping_comuna")}
                  className="campo"
                  placeholder="Providencia"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="direccion" className="etiqueta-campo">
                  Dirección
                </label>
                <textarea
                  id="direccion"
                  value={form.shipping_address}
                  onChange={update("shipping_address")}
                  rows={2}
                  className="campo"
                  placeholder="Calle, número, departamento"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notas" className="etiqueta-campo">
                  Notas para el reparto (opcional)
                </label>
                <input
                  id="notas"
                  value={form.shipping_notes}
                  onChange={update("shipping_notes")}
                  className="campo"
                  placeholder="Dejar con conserje"
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="panel p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-extrabold">Resumen</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Subtotal</dt>
              <dd className="font-medium">{clp(total())}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío</dt>
              <dd className="font-medium">{envio === 0 ? "Gratis" : clp(envio)}</dd>
            </div>
            <div className="flex justify-between border-t border-humo pt-3 font-display text-lg font-extrabold">
              <dt>Total</dt>
              <dd>{clp(total() + envio)}</dd>
            </div>
          </dl>

          {falta > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
              Te faltan {clp(falta)} para el envío gratis.
            </p>
          )}

          {error && (
            <div className="mt-4">
              <Aviso tono="error">{error}</Aviso>
            </div>
          )}

          <button
            onClick={confirmar}
            disabled={loading}
            className="btn btn-primario btn-grande mt-5 w-full"
          >
            {loading ? "Creando pedido…" : "Confirmar pedido"}
          </button>

          <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
            Reservamos el stock por {duracionReserva(config?.reservation_minutes)} y te
            mostramos los datos para transferir.
          </p>
        </aside>
      </div>
    </div>
  );
}
