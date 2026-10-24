import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type Estado = "exito" | "pendiente" | "error" | null;

const MENSAJES: Record<Exclude<Estado, null>, { titulo: string; texto: string; destino: string }> = {
  exito: {
    titulo: "¡Pago aprobado!",
    texto: "Tu pedido está confirmado y lo prepararemos a la brevedad.",
    destino: "/mis-pedidos",
  },
  pendiente: {
    titulo: "Pago pendiente",
    texto: "Te avisaremos por correo cuando la pasarela confirme el pago.",
    destino: "/mis-pedidos",
  },
  error: {
    titulo: "El pago no se completó",
    texto: "No se realizó ningún cobro. Puedes revisar tu carrito e intentarlo otra vez.",
    destino: "/carrito",
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
      3000
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [status, navigate]);

  if (!status || !MENSAJES[status]) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full text-center">
          <h2 className="text-xl font-medium text-gray-900">No hay un pago en curso</h2>
          <p className="text-gray-500 mt-2">Vuelve al catálogo para continuar comprando.</p>
          <button
            onClick={() => navigate("/catalogo")}
            className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Ir al catálogo
          </button>
        </div>
      </div>
    );
  }

  const mensaje = MENSAJES[status];
  const ok = status !== "error";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full text-center">
        <div
          className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl ${
            ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
          aria-hidden
        >
          {ok ? "✓" : "!"}
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">{mensaje.titulo}</h2>
        <p className="text-gray-600 mt-2">{mensaje.texto}</p>
        <p className="text-sm text-gray-400 mt-4">
          Te llevaremos en {cuenta} segundo{cuenta === 1 ? "" : "s"}...
        </p>
        <button
          onClick={() => navigate(mensaje.destino, { replace: true })}
          className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          {status === "error" ? "Volver al carrito" : "Ver mis pedidos"}
        </button>
      </div>
    </div>
  );
}
