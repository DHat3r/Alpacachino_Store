import { Link } from "react-router-dom";

import Alpaca from "../components/Alpaca";

export default function NotFound() {
  return (
    <div className="contenedor py-24 text-center">
      <div className="relative mx-auto w-fit">
        <div className="relative mx-auto mb-3 w-fit rounded-2xl bg-superficie px-4 py-2.5 text-sm font-semibold shadow-panel">
          Esta página no existe
          <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-superficie" />
        </div>
        <Alpaca sombrero animarSombrero className="mx-auto h-24 w-24 text-morado-texto" />
      </div>

      <h1 className="mt-6 font-display text-4xl font-extrabold">404</h1>
      <p className="mx-auto mt-2 max-w-sm text-tinta-suave">
        El enlace puede estar mal escrito o el contenido ya no está publicado.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        <Link to="/" className="btn btn-primario">
          Ir al inicio
        </Link>
        <Link to="/catalogo" className="btn btn-secundario">
          Ver catálogo
        </Link>
      </div>
    </div>
  );
}
