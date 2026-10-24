import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Cargando, ErrorCarga, EstadoPedido, Vacio } from "../components/ui";
import { api } from "../api/client";
import { clp, fecha, plural } from "../lib/format";

interface Order {
  id: number;
  status: string;
  total: number;
  created_at: string;
  expires_at: string | null;
  items: Array<{ id: number; title: string | null; quantity: number }>;
}

export default function MyOrders() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const res = await api.get("/orders", { params: { size: 20 } });
      return res.data.items as Order[];
    },
  });

  if (isLoading) return <Cargando texto="Cargando tus pedidos" />;
  if (error)
    return (
      <div className="contenedor py-12">
        <ErrorCarga />
      </div>
    );

  return (
    <div className="contenedor py-10">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Mis pedidos</h1>

      {!data || data.length === 0 ? (
        <div className="mt-8">
          <Vacio
            titulo="Todavía no tienes pedidos"
            texto="Cuando confirmes tu primera compra, la verás acá con su estado."
            accion={{ a: "/catalogo", texto: "Ver catálogo" }}
          />
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {data.map((pedido) => (
            <li key={pedido.id}>
              <Link
                to={`/pedido/${pedido.id}`}
                className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-5 transition-colors hover:border-morado/40"
              >
                <div className="min-w-40">
                  <p className="font-display text-lg font-extrabold">
                    Pedido #{pedido.id}
                  </p>
                  <p className="text-sm text-tinta-suave">{fecha(pedido.created_at)}</p>
                </div>

                <p className="text-sm text-tinta-suave">
                  {plural(pedido.items.length, "título", "títulos")}
                </p>

                <p className="font-semibold">{clp(pedido.total)}</p>

                <div className="ml-auto flex items-center gap-4">
                  <EstadoPedido estado={pedido.status} />
                  <span className="text-sm font-medium text-morado">Ver detalle</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
