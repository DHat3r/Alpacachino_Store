import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import { Aviso, Cargando, EstadoPedido, Vacio } from "../components/ui";
import { api } from "../api/client";
import { useConfig, type PaymentInstructions } from "../api/config";
import { clp, faltan, fechaHora } from "../lib/format";

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

  const { data: pedido, isLoading, error: queryError } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const res = await api.get(`/orders/${id}`);
      return res.data as Order;
    },
    enabled: !!id,
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/orders/${id}/cancel`);
      return res.data as Order;
    },
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      setError(typeof detail === "string" ? detail : "No pudimos cancelar el pedido.");
    },
  });

  if (isLoading) return <Cargando texto="Cargando el pedido" />;
  if (queryError || !pedido)
    return (
      <div className="contenedor py-16">
        <Vacio
          titulo="No encontramos este pedido"
          accion={{ a: "/mis-pedidos", texto: "Ver mis pedidos" }}
        />
      </div>
    );

  const instrucciones: PaymentInstructions | null | undefined =
    (location.state as { paymentInstructions?: PaymentInstructions } | null)
      ?.paymentInstructions ??
    (pedido.status === "pending" ? config?.payment_instructions : null);

  const restante = faltan(pedido.expires_at);

  return (
    <div className="contenedor py-10">
      <nav className="mb-6 text-sm text-tinta-suave">
        <Link to="/mis-pedidos" className="hover:text-morado-texto">
          Mis pedidos
        </Link>
        <span className="px-2 text-humo">/</span>
        <span>Pedido #{pedido.id}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          Pedido #{pedido.id}
        </h1>
        <EstadoPedido estado={pedido.status} />
      </div>

      {pedido.status === "pending" && (
        <div className="mt-6">
          <Aviso tono="atencion">
            Tenemos el stock reservado
            {restante ? <> por {restante} más</> : null}
            {pedido.expires_at && <> (hasta el {fechaHora(pedido.expires_at)})</>}. Si no
            recibimos el pago, el pedido se libera automáticamente.
          </Aviso>
        </div>
      )}

      {instrucciones && pedido.status === "pending" && (
        <section className="panel mt-6 overflow-hidden">
          <div className="bg-morado px-6 py-4">
            <h2 className="font-display text-lg font-extrabold text-white">
              Transfiere {clp(pedido.total)}
            </h2>
            <p className="mt-0.5 text-sm text-white/75">
              Usa el número de pedido #{pedido.id} como comentario.
            </p>
          </div>
          <dl className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">
            {instrucciones.bank && <Linea termino="Banco" valor={instrucciones.bank} />}
            {instrucciones.account_type && (
              <Linea termino="Tipo de cuenta" valor={instrucciones.account_type} />
            )}
            {instrucciones.account_number && (
              <Linea termino="Número de cuenta" valor={instrucciones.account_number} />
            )}
            {instrucciones.holder && <Linea termino="Titular" valor={instrucciones.holder} />}
            {instrucciones.rut && <Linea termino="RUT" valor={instrucciones.rut} />}
            {instrucciones.email && (
              <Linea termino="Enviar comprobante a" valor={instrucciones.email} />
            )}
          </dl>
          {instrucciones.note && (
            <p className="border-t border-humo px-6 py-4 text-sm text-tinta-suave">
              {instrucciones.note}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="font-display text-lg font-extrabold">Productos</h2>
            <ul className="mt-4 space-y-4">
              {pedido.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4">
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-humo bg-papel">
                    {item.cover_url ? (
                      <img src={item.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Alpaca className="h-7 w-7 text-humo" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {item.sku ? (
                        <Link to={`/producto/${item.sku}`} className="hover:text-morado-texto">
                          {item.title ?? "Título"}
                        </Link>
                      ) : (
                        (item.title ?? "Título")
                      )}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {item.quantity} × {clp(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {clp(Number(item.unit_price) * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-extrabold">Despacho</h2>
            <div className="mt-3 space-y-1 text-sm text-tinta-suave">
              {pedido.shipping_name && <p className="font-medium text-tinta">{pedido.shipping_name}</p>}
              {pedido.shipping_phone && <p>{pedido.shipping_phone}</p>}
              <p className="whitespace-pre-line">
                {pedido.shipping_address || "Sin dirección registrada"}
              </p>
              {(pedido.shipping_comuna || pedido.shipping_region) && (
                <p>{[pedido.shipping_comuna, pedido.shipping_region].filter(Boolean).join(", ")}</p>
              )}
              {pedido.shipping_notes && <p>Notas: {pedido.shipping_notes}</p>}
            </div>
          </section>
        </div>

        <aside className="panel p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-extrabold">Resumen</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Subtotal</dt>
              <dd className="font-medium">{clp(pedido.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío</dt>
              <dd className="font-medium">
                {Number(pedido.shipping) === 0 ? "Gratis" : clp(pedido.shipping)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-humo pt-3 font-display text-lg font-extrabold">
              <dt>Total</dt>
              <dd>{clp(pedido.total)}</dd>
            </div>
          </dl>

          <div className="mt-6 space-y-1 border-t border-humo pt-4 text-xs text-tinta-suave">
            <p>Creado el {fechaHora(pedido.created_at)}</p>
            {pedido.paid_at && <p>Pagado el {fechaHora(pedido.paid_at)}</p>}
          </div>

          {pedido.status === "pending" && (
            <button
              onClick={() => {
                if (confirm("¿Cancelar este pedido y liberar el stock?")) cancelar.mutate();
              }}
              disabled={cancelar.isPending}
              className="btn btn-peligro mt-5 w-full"
            >
              {cancelar.isPending ? "Cancelando…" : "Cancelar pedido"}
            </button>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-alerta">
              {error}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Linea({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{termino}</dt>
      <dd className="font-semibold">{valor}</dd>
    </div>
  );
}
