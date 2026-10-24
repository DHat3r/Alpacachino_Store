import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");

  useEffect(() => {
    if (status === "exito") {
      alert("¡Pago aprobado! Tu pedido está siendo procesado.");
      window.location.href = "/mis-pedidos";
    } else if (status === "error") {
      alert("El pago fue rechazado. Por favor intenta nuevamente.");
      window.location.href = "/carrito";
    } else if (status === "pendiente") {
      alert("El pago está pendiente. Te notificaremos cuando se confirme.");
      window.location.href = "/mis-pedidos";
    }
  }, [status]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-gray-900">Procesando pago...</h2>
        <p className="text-gray-500 mt-2">Serás redirigido automáticamente</p>
      </div>
    </div>
  );
}