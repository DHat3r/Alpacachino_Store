import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type Estado = "exito" | "pendiente" | "error" | null;

const MENSAJES: Record<
  Exclude<Estado, null>,
  { titulo: string; texto: string; destino: string; boton: string }
> = {
  exito: {
    titulo: "Pago aprobado",
    texto: "Tu pedido quedó confirmado y lo preparamos en las próximas horas.",
    destino: "/mis-pedidos",
    boton: "Ver mis pedidos",
  },
  pendiente: {
    titulo: "Pago en revisión",
    texto: "Te avisamos por correo apenas la pasarela confirme la transacción.",
    destino: "/mis-pedidos",
    boton: "Ver mis pedidos",
  },
  error: {
    titulo: "El pago no se completó",
    texto: "No se realizó ningún cobro. Puedes revisar el carrito e intentarlo otra vez.",
    destino: "/carrito",
    boton: "Volver al carrito",
  },
};

/** Retorno de la pasarela: muestra el resultado y navega sin recargar la página. */
export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = searchParams.get("status") as Estado;
  const [cuenta, setCuenta] = useState(3);

  useEffect(() => {
    if (!status || !MENSAJES[status]) return;
    setCuenta(3);
    const interval = window.setInterval(() => {
      setCuenta((n) => Math.max(0, n - 1));
    }, 1000);
    const timeout = window.setTimeout(
      () => navigate(MENSAJES[status].destino, { replace: true }),
      3000,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [status, navigate]);

  if (!status || !MENSAJES[status]) {
    return (
      <div className="contenedor py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">No hay un pago en curso</h1>
        <p className="mt-2 text-tinta-suave">
          Vuelve al catálogo para seguir comprando.
        </p>
        <button onClick={() => navigate("/catalogo")} className="btn btn-primario mt-6">
          Ir al catálogo
        </button>
      </div>
    );
  }

  const mensaje = MENSAJES[status];
  const ok = status !== "error";

  return (
    <div className="contenedor py-20">
      <div className="panel mx-auto max-w-md p-8 text-center">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold ${
            ok ? "bg-exito-tenue text-exito" : "bg-alerta-tenue text-alerta"
          }`}
          aria-hidden
        >
          {ok ? "✓" : "!"}
        </div>
        <h1 className="mt-5 font-display text-2xl font-extrabold">{mensaje.titulo}</h1>
        <p className="mt-2 text-tinta-suave">{mensaje.texto}</p>
        <p className="mt-4 text-sm text-tinta-suave/70">
          Te llevamos en {cuenta} {cuenta === 1 ? "segundo" : "segundos"}…
        </p>
        <button
          onClick={() => navigate(mensaje.destino, { replace: true })}
          className="btn btn-primario mt-6"
        >
          {mensaje.boton}
        </button>
      </div>
    </div>
  );
}
