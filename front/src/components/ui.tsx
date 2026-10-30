import { Link } from "react-router-dom";

/* ------------------------------------------------------------------ */
/* Piezas sueltas                                                       */
/* ------------------------------------------------------------------ */

export function Vacio({
  titulo,
  texto,
  accion,
}: {
  titulo: string;
  texto?: string;
  accion?: { a: string; texto: string };
}) {
  return (
    <div className="panel-papel px-6 py-14 text-center">
      <h2 className="font-display text-xl font-extrabold">{titulo}</h2>
      {texto && <p className="mx-auto mt-2 max-w-sm text-tinta-suave">{texto}</p>}
      {accion && (
        <Link to={accion.a} className="btn btn-primario mt-6">
          {accion.texto}
        </Link>
      )}
    </div>
  );
}

export function Cargando({ texto = "Cargando" }: { texto?: string }) {
  return (
    <p className="py-16 text-center text-tinta-suave" role="status">
      {texto}…
    </p>
  );
}

export function ErrorCarga({
  texto = "No pudimos cargar esta sección. Revisa tu conexión y vuelve a intentarlo.",
}: {
  texto?: string;
}) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="text-tinta-suave">{texto}</p>
      <button onClick={() => window.location.reload()} className="btn btn-secundario mt-4">
        Reintentar
      </button>
    </div>
  );
}

export function FichaSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[3/4] rounded-ficha bg-nube-hondo" />
      <div className="mt-3 h-3 w-1/3 rounded bg-nube-hondo" />
      <div className="mt-2 h-4 w-4/5 rounded bg-nube-hondo" />
    </div>
  );
}

export function Paginacion({
  pagina,
  totalPaginas,
  onCambio,
}: {
  pagina: number;
  totalPaginas: number;
  onCambio: (p: number) => void;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <nav className="mt-10 flex items-center justify-center gap-4" aria-label="Paginación">
      <button
        onClick={() => onCambio(Math.max(1, pagina - 1))}
        disabled={pagina <= 1}
        className="btn btn-secundario"
      >
        Anterior
      </button>
      <span className="text-sm text-tinta-suave">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        onClick={() => onCambio(Math.min(totalPaginas, pagina + 1))}
        disabled={pagina >= totalPaginas}
        className="btn btn-secundario"
      >
        Siguiente
      </button>
    </nav>
  );
}
