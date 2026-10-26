import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../../api/client";
import { Aviso, Cargando, ErrorCarga, Paginacion } from "../../components/ui";
import { fechaHora } from "../../lib/format";
import { mensajeError, type Pagina } from "./comun";

interface Reporte {
  id: number;
  post_id: number | null;
  comment_id: number | null;
  reporter_username: string;
  reason: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  post_title: string | null;
  comment_body: string | null;
}

type Filtro = "pendientes" | "resueltos" | "todos";

export default function ModeracionTab() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [pagina, setPagina] = useState(1);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-reportes", filtro, pagina],
    queryFn: async () => {
      const res = await api.get("/forum/admin/reports", {
        params: {
          page: pagina,
          size: 10,
          ...(filtro === "todos" ? {} : { resolved: filtro === "resueltos" }),
        },
      });
      return res.data as Pagina<Reporte>;
    },
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["admin-reportes"] });

  const ocultar = useMutation({
    mutationFn: (r: Reporte) =>
      r.comment_id
        ? api.patch(`/forum/admin/comments/${r.comment_id}/hide`, null, { params: { hide: true } })
        : api.patch(`/forum/admin/posts/${r.post_id}/hide`, null, { params: { hide: true } }),
    onSuccess: () => {
      setAviso({ tono: "ok", texto: "Contenido oculto. Recuerda marcar el reporte como resuelto." });
      qc.invalidateQueries({ queryKey: ["forum-posts"] });
    },
    onError: (e) => setAviso({ tono: "error", texto: mensajeError(e, "No se pudo ocultar.") }),
  });

  const resolver = useMutation({
    mutationFn: (id: number) => api.patch(`/forum/admin/reports/${id}/resolve`),
    onSuccess: () => {
      setAviso({ tono: "ok", texto: "Reporte resuelto." });
      refrescar();
    },
    onError: (e) => setAviso({ tono: "error", texto: mensajeError(e, "No se pudo resolver.") }),
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["pendientes", "resueltos", "todos"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFiltro(f);
              setPagina(1);
            }}
            className={`btn !px-4 !py-1.5 ${filtro === f ? "btn-primario" : "btn-secundario"}`}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        {data && <span className="ml-2 text-sm text-tinta-suave">{data.total} reporte(s)</span>}
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {isLoading && <Cargando texto="Cargando reportes" />}
      {error && <ErrorCarga />}
      {data && data.items.length === 0 && (
        <p className="panel px-6 py-10 text-center text-tinta-suave">
          {filtro === "pendientes" ? "No hay reportes pendientes. Todo en orden." : "No hay reportes."}
        </p>
      )}

      <ul className="space-y-3">
        {data?.items.map((r) => {
          const esComentario = r.comment_id != null;
          return (
            <li key={r.id} className="panel p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-suave">
                <span className={`insignia ${esComentario ? "bg-nube-hondo text-tinta-suave" : "bg-morado-tenue text-morado-texto"}`}>
                  {esComentario ? "Comentario" : "Publicación"}
                </span>
                <span>por {r.reporter_username}</span>
                <span aria-hidden>·</span>
                <span>{fechaHora(r.created_at)}</span>
                {r.resolved && (
                  <span className="insignia bg-exito-tenue text-exito">Resuelto</span>
                )}
              </div>

              <p className="mt-3 text-sm">
                <span className="font-semibold">Motivo: </span>
                {r.reason}
              </p>
              <p className="mt-2 line-clamp-3 rounded-lg bg-papel px-3 py-2 text-sm text-tinta-suave">
                {esComentario ? r.comment_body : r.post_title}
              </p>

              {!r.resolved && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {!esComentario && r.post_id && (
                    <Link to={`/foro/${r.post_id}`} className="btn btn-secundario !px-3 !py-1.5">
                      Ver publicación
                    </Link>
                  )}
                  <button
                    className="btn btn-peligro !px-3 !py-1.5"
                    disabled={ocultar.isPending}
                    onClick={() => ocultar.mutate(r)}
                  >
                    Ocultar contenido
                  </button>
                  <button
                    className="btn btn-primario !px-3 !py-1.5"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate(r.id)}
                  >
                    Marcar resuelto
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambio={setPagina} />
    </div>
  );
}
