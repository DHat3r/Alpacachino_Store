import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Estados de pedido                                                    */
/* ------------------------------------------------------------------ */

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pending: { texto: "Esperando pago", clase: "bg-durazno-tenue text-durazno-hondo" },
  paid: { texto: "Pagado", clase: "bg-exito-tenue text-exito" },
  shipped: { texto: "Enviado", clase: "bg-morado-tenue text-morado" },
  delivered: { texto: "Entregado", clase: "bg-exito-tenue text-exito" },
  cancelled: { texto: "Cancelado", clase: "bg-nube-hondo text-tinta-suave" },
  expired: { texto: "Reserva vencida", clase: "bg-nube-hondo text-tinta-suave" },
  failed: { texto: "Pago rechazado", clase: "bg-alerta-tenue text-alerta" },
};

export function EstadoPedido({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { texto: estado, clase: "bg-nube-hondo text-tinta-suave" };
  return <span className={`insignia ${e.clase}`}>{e.texto}</span>;
}

export function textoEstado(estado: string): string {
  return ESTADOS[estado]?.texto ?? estado;
}

/* ------------------------------------------------------------------ */
/* Piezas sueltas                                                       */
/* ------------------------------------------------------------------ */

export function Estrellas({
  valor,
  cantidad,
}: {
  valor: number;
  cantidad?: number | null;
}) {
  const llenas = Math.round(valor);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden className="text-durazno">
        {"★".repeat(llenas)}
        <span className="text-humo">{"★".repeat(Math.max(0, 5 - llenas))}</span>
      </span>
      <span className="font-semibold">{valor.toFixed(1)}</span>
      {cantidad != null && (
        <span className="text-tinta-suave">
          ({cantidad} {cantidad === 1 ? "reseña" : "reseñas"})
        </span>
      )}
    </span>
  );
}

export function Aviso({
  tono = "info",
  children,
}: {
  tono?: "info" | "error" | "ok" | "atencion";
  children: ReactNode;
}) {
  const clases = {
    info: "bg-morado-tenue text-morado-hondo",
    error: "bg-alerta-tenue text-alerta",
    ok: "bg-exito-tenue text-exito",
    atencion: "bg-durazno-tenue text-tinta",
  }[tono];
  return (
    <div
      role={tono === "error" ? "alert" : undefined}
      className={`rounded-xl px-4 py-3 text-sm ${clases}`}
    >
      {children}
    </div>
  );
}

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
