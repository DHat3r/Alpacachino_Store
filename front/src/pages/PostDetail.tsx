import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Aviso, Cargando, Vacio } from "../components/ui";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { fechaHora, plural } from "../lib/format";

interface Post {
  id: number;
  author_id: number;
  author_username: string;
  title: string;
  body: string;
  product_id: string | null;
  product: { id: string; sku: string; title: string } | null;
  rating: number | null;
  is_hidden: boolean;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  comments_count: number;
}

interface Comment {
  id: number;
  post_id: number;
  author_id: number;
  author_username: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, hasRole } = useAuth();

  const [comentario, setComentario] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [textoEdicion, setTextoEdicion] = useState("");
  const [editandoPost, setEditandoPost] = useState(false);
  const [tituloPost, setTituloPost] = useState("");
  const [cuerpoPost, setCuerpoPost] = useState("");
  const [reportado, setReportado] = useState(false);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["forum-post", id],
    queryFn: async () => {
      const res = await api.get(`/forum/posts/${id}`);
      return res.data as Post;
    },
    enabled: !!id,
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ["forum-comments", id],
    queryFn: async () => {
      const res = await api.get(`/forum/posts/${id}/comments`);
      return res.data as Comment[];
    },
    enabled: !!id,
  });

  const comentar = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post(`/forum/posts/${id}/comments`, { body });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-comments", id] });
      queryClient.invalidateQueries({ queryKey: ["forum-post", id] });
      setComentario("");
    },
  });

  const borrarPost = useMutation({
    mutationFn: async () => {
      await api.delete(`/forum/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-posts"] });
      navigate("/foro");
    },
  });

  const editarComentario = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: number; body: string }) => {
      const res = await api.patch(`/forum/comments/${commentId}`, { body });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-comments", id] });
      setEditandoId(null);
      setTextoEdicion("");
    },
  });

  const borrarComentario = useMutation({
    mutationFn: async (commentId: number) => {
      await api.delete(`/forum/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-comments", id] });
      queryClient.invalidateQueries({ queryKey: ["forum-post", id] });
    },
  });

  const actualizarPost = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/forum/posts/${id}`, {
        title: tituloPost,
        body: cuerpoPost,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-post", id] });
      queryClient.invalidateQueries({ queryKey: ["forum-posts"] });
      setEditandoPost(false);
    },
  });

  const reportar = useMutation({
    mutationFn: async (reason: string) => {
      await api.post(`/forum/posts/${id}/report`, { reason });
    },
    onSuccess: () => setReportado(true),
  });

  if (isLoading) return <Cargando texto="Cargando la publicación" />;
  if (error || !post)
    return (
      <div className="contenedor py-16">
        <Vacio
          titulo="No encontramos esta publicación"
          accion={{ a: "/foro", texto: "Volver al foro" }}
        />
      </div>
    );

  const puedeModerar = hasRole(["admin", "moderator"]);
  const puedeEditar = isAuthenticated() && (user?.id === post.author_id || puedeModerar);

  if (post.is_hidden && !puedeModerar)
    return (
      <div className="contenedor py-16">
        <Vacio
          titulo="Esta publicación está oculta"
          texto="La moderación la retiró del foro."
          accion={{ a: "/foro", texto: "Volver al foro" }}
        />
      </div>
    );

  return (
    <div className="contenedor max-w-3xl py-10">
      <nav className="mb-6 text-sm text-tinta-suave">
        <Link to="/foro" className="hover:text-morado-texto">
          Foro
        </Link>
        <span className="px-2 text-humo">/</span>
        <span className="line-clamp-1">{post.title}</span>
      </nav>

      <article className="panel p-6">
        {editandoPost ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              actualizarPost.mutate();
            }}
          >
            <div>
              <label htmlFor="editar-titulo" className="etiqueta-campo">
                Título
              </label>
              <input
                id="editar-titulo"
                value={tituloPost}
                onChange={(e) => setTituloPost(e.target.value)}
                minLength={3}
                maxLength={160}
                required
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="editar-cuerpo" className="etiqueta-campo">
                Mensaje
              </label>
              <textarea
                id="editar-cuerpo"
                value={cuerpoPost}
                onChange={(e) => setCuerpoPost(e.target.value)}
                minLength={10}
                rows={8}
                required
                className="campo"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={actualizarPost.isPending}
                className="btn btn-primario"
              >
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={() => setEditandoPost(false)}
                className="btn btn-secundario"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">
                {post.title}
              </h1>
              {post.is_pinned && (
                <span className="insignia bg-durazno-tenue text-durazno-hondo">Fijado</span>
              )}
              {post.is_locked && (
                <span className="insignia bg-nube-hondo text-tinta-suave">Cerrado</span>
              )}
              {post.is_hidden && (
                <span className="insignia bg-alerta-tenue text-alerta">Oculto</span>
              )}
            </div>

            {post.rating != null && (
              <p className="mt-3 flex items-center gap-2">
                <span className="text-lg text-durazno">
                  {"★".repeat(post.rating)}
                  <span className="text-humo">{"★".repeat(5 - post.rating)}</span>
                </span>
                <span className="insignia bg-exito-tenue text-exito">Compra verificada</span>
              </p>
            )}

            <p className="mt-3 text-sm text-tinta-suave">
              {post.author_username}
              <span className="mx-2 text-humo">|</span>
              {fechaHora(post.created_at)}
              {post.updated_at !== post.created_at && (
                <>
                  <span className="mx-2 text-humo">|</span>
                  editado
                </>
              )}
            </p>

            {post.product && (
              <Link
                to={`/producto/${post.product.sku}`}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-morado-tenue px-3.5 py-1.5 text-sm font-semibold text-morado-texto"
              >
                {post.product.title}
              </Link>
            )}

            <div className="mt-5 whitespace-pre-wrap leading-relaxed text-tinta-suave">
              {post.body}
            </div>

            {isAuthenticated() && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-humo pt-4">
              {puedeEditar && (
                <>
                  <button
                    onClick={() => {
                      setTituloPost(post.title);
                      setCuerpoPost(post.body);
                      setEditandoPost(true);
                    }}
                    className="btn btn-secundario"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("¿Eliminar esta publicación?")) borrarPost.mutate();
                    }}
                    className="btn btn-peligro"
                  >
                    Eliminar
                  </button>
                </>
              )}
              {isAuthenticated() && !puedeEditar && (
                <button
                  onClick={() => {
                    const motivo = prompt("¿Por qué estás reportando esta publicación?");
                    if (motivo && motivo.trim().length >= 3) reportar.mutate(motivo.trim());
                  }}
                  disabled={reportado || reportar.isPending}
                  className="btn btn-fantasma"
                >
                  {reportado ? "Reporte enviado" : "Reportar"}
                </button>
              )}
            </div>
            )}
          </>
        )}
      </article>

      <section className="mt-10">
        <h2 className="titulo-seccion">
          {plural(comentarios.length, "comentario", "comentarios")}
        </h2>

        {post.is_locked ? (
          <div className="mt-4">
            <Aviso tono="atencion">
              Esta publicación está cerrada a nuevos comentarios.
            </Aviso>
          </div>
        ) : isAuthenticated() ? (
          <form
            className="panel mt-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!comentario.trim()) return;
              comentar.mutate(comentario);
            }}
          >
            <label htmlFor="comentario" className="etiqueta-campo">
              Tu comentario
            </label>
            <textarea
              id="comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              required
              className="campo"
              placeholder="Aporta algo a la conversación"
            />
            <button
              type="submit"
              disabled={comentar.isPending || !comentario.trim()}
              className="btn btn-primario mt-3"
            >
              {comentar.isPending ? "Publicando…" : "Comentar"}
            </button>
          </form>
        ) : (
          <div className="mt-4">
            <Aviso>
              <Link to="/login" className="font-semibold underline underline-offset-4">
                Inicia sesión
              </Link>{" "}
              para comentar.
            </Aviso>
          </div>
        )}

        <ul className="mt-6 space-y-4">
          {comentarios.map((c) => (
            <li key={c.id} className="panel p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-morado-tenue text-sm font-bold text-morado-texto">
                  {c.author_username[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{c.author_username}</span>
                    <span className="text-xs text-tinta-suave">{fechaHora(c.created_at)}</span>
                    {c.is_hidden && (
                      <span className="insignia bg-alerta-tenue text-alerta">Oculto</span>
                    )}
                    {(user?.id === c.author_id || puedeModerar) && editandoId !== c.id && (
                      <span className="ml-auto flex gap-3 text-xs font-semibold">
                        <button
                          onClick={() => {
                            setEditandoId(c.id);
                            setTextoEdicion(c.body);
                          }}
                          className="text-morado-texto hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("¿Eliminar este comentario?"))
                              borrarComentario.mutate(c.id);
                          }}
                          className="text-alerta hover:underline"
                        >
                          Eliminar
                        </button>
                      </span>
                    )}
                  </div>

                  {editandoId === c.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={textoEdicion}
                        onChange={(e) => setTextoEdicion(e.target.value)}
                        rows={3}
                        className="campo"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            editarComentario.mutate({ commentId: c.id, body: textoEdicion })
                          }
                          disabled={!textoEdicion.trim() || editarComentario.isPending}
                          className="btn btn-primario"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditandoId(null)}
                          className="btn btn-secundario"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed text-tinta-suave">
                      {c.body}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {comentarios.length === 0 && !post.is_locked && (
          <p className="mt-6 text-center text-tinta-suave">
            Nadie ha comentado todavía.
          </p>
        )}
      </section>
    </div>
  );
}
