import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full text-center">
        <p className="text-6xl font-bold text-indigo-600">404</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">
          No encontramos esta página
        </h1>
        <p className="text-gray-600 mt-2">
          El enlace puede estar mal escrito o el contenido ya no existe.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            to="/"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Ir al inicio
          </Link>
          <Link
            to="/catalogo"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Ver catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
