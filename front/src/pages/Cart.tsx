import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import { api } from "../api/client";
import { useState } from "react";

export default function Cart() {
  const { items, remove, setQty, clear, total, itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    if (!address.trim()) {
      alert("Por favor ingresa tu dirección de envío");
      return;
    }
    if (items.length === 0) return;

    setLoading(true);
    try {
      const res = await api.post("/orders/checkout", {
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        shipping_address: address,
      });
      clear();
      if (res.data.payment_url) {
        window.location.href = res.data.payment_url;
      } else {
        // La pasarela no está configurada: el pedido quedó reservado.
        alert("Pedido creado. La pasarela de pago no está disponible; revisa tus pedidos.");
        navigate(`/pedido/${res.data.order_id}`);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al crear el pedido");
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
            {total() >= 30000 ? "Gratis" : "$3.500"}
          </span>
        </div>
        <div className="border-t pt-4 flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>${(total() + (total() >= 30000 ? 0 : 3500)).toLocaleString("es-CL")}</span>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dirección de envío
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Calle, número, comuna, ciudad, código postal..."
            required
          />
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading || !address.trim()}
          className="mt-6 w-full py-3 px-6 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? "Procesando..." : "Ir a pagar"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-500">
          {total() < 30000 && <span>Envío gratis en compras sobre $30.000 (faltan ${(30000 - total()).toLocaleString("es-CL")})</span>}
        </p>
      </div>
    </div>
  );
}