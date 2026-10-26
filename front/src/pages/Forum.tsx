import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Aviso, Cargando, ErrorCarga, Paginacion, Vacio } from "../components/ui";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { fecha, plural } from "../lib/format";

interface PostProduct {
  id: string;
  sku: string;
  title: string;
  cover_url: string | null;
}

interface Post {
  id: number;
  author_username: string;
  title: string;
  body: string;
  product: PostProduct | null;
  rating: number | null;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  comments_count: number;
}

interface PostPage {
  items: Post[];
  total: number;
  page: number;
  size: number;
}

type Tipo = "" | "review" | "discussion";

const TIPOS: Array<[Tipo, string]> = [
  ["", "Todo"],
  ["discussion", "Conversaciones"],
  ["review", "Reseñas"],
];

const TAMANO = 10;

export default function Forum() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("producto") ?? "";
  const queryClient = useQueryClient();

  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [tipo, setTipo] = useState<Tipo>("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["forum-posts", tipo, q, pagina, productId],
    queryFn: async () => {
      const res = await api.get("/forum/posts", {
        params: {
          page: pagina,
          size: TAMANO,
          ...(tipo ? { kind: tipo } : {}),
          ...(q ? { q } : {}),
          ...(productId ? { product_id: productId } : {}),
        },
      });
      return res.data as PostPage;
    },
  });

  const publicar = useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const res = await api.post("/forum/posts", payload);
      return res.data as Post;
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["forum-posts"] });
      setAbierto(false);
      setTitulo("");
      setCuerpo("");
      navigate(`/foro/${post.id}`);
    },
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="contenedor max-w-4xl py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Foro</h1>
          <p className="mt-2 text-tinta-suave">
            Reseñas con compra verificada y conversaciones sobre lo que estamos leyendo.
          </p>
        </div>
        {isAuthenticated() ? (
          <button onClick={() => setAbierto((v) => !v)} className="btn btn-primario">
            {abierto ? "Cerrar" : "Nueva publicación"}
          </button>
        ) : (
          <Link to="/login" className="btn btn-secundario">
            Entrar para publicar
          </Link>
        )}
      </header>

      {abierto && (
        <form
          className="panel mt-6 space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!titulo.trim() || !cuerpo.trim()) return;
            publicar.mutate({ title: titulo, body: cuerpo });
          }}
        >
          <div>
            <label htmlFor="titulo" className="etiqueta-campo">
              Título
            </label>
            <input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              minLength={3}
              maxLength={160}
              required
              className="campo"
              placeholder="¿Por dónde empiezo con Urasawa?"
            />
          </div>
          <div>
            <label htmlFor="cuerpo" className="etiqueta-campo">
              Mensaje
            </label>
            <textarea
              id="cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              minLength={10}
              rows={6}
              required
              className="campo"
            />
          </div>
          <p className="text-xs text-tinta-suave">
            ¿Quieres reseñar con estrellas? Entra al título que compraste y usa «Escribir
            reseña».
          </p>
          {publicar.isError && <Aviso tono="error">No pudimos publicar tu mensaje.</Aviso>}
          <div className="flex gap-2">
            <button type="submit" disabled={publicar.isPending} className="btn btn-primario">
              {publicar.isPending ? "Publicando…" : "Publicar"}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="btn btn-secundario">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {TIPOS.map(([valor, etiqueta]) => (
            <button
              key={etiqueta}
              onClick={() => {
                setTipo(valor);
                setPagina(1);
              }}
              aria-pressed={tipo === valor}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tipo === valor
                  ? "bg-morado text-white"
                  : "bg-superficie text-tinta-suave hover:bg-morado-tenue"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPagina(1);
          }}
          placeholder="Buscar en el foro"
          className="campo ml-auto max-w-xs"
        />
      </div>

      {productId && (
        <div className="mt-4">
          <Aviso>
            Viendo solo las publicaciones de este título.{" "}
            <Link to="/foro" className="font-semibold underline underline-offset-4">
              Ver todo el foro
            </Link>
          </Aviso>
        </div>
      )}

      {isLoading ? (
        <Cargando texto="Cargando el foro" />
      ) : error ? (
        <div className="mt-8">
          <ErrorCarga />
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="mt-6 space-y-3">
            {data.items.map((post) => (
              <li key={post.id}>
                <Link
                  to={`/foro/${post.id}`}
                  className="panel flex gap-4 p-5 transition-colors hover:border-morado/40"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-morado-tenue font-bold text-morado-texto">
                    {post.author_username[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-extrabold leading-snug">
                        {post.title}
                      </h2>
                      {post.is_pinned && (
                        <span className="insignia bg-durazno-tenue text-durazno-hondo">
                          Fijado
                        </span>
                      )}
                      {post.is_locked && (
                        <span className="insignia bg-nube-hondo text-tinta-suave">
                          Cerrado
                        </span>
                      )}
                      {post.rating != null && (
                        <span className="text-sm text-durazno">
                          {"★".repeat(post.rating)}
                          <span className="text-humo">{"★".repeat(5 - post.rating)}</span>
                        </span>
                      )}
                    </div>

                    {post.product && (
                      <p className="mt-1 text-sm text-morado-texto">{post.product.title}</p>
                    )}

                    <p className="mt-1.5 line-clamp-2 text-tinta-suave">{post.body}</p>

                    <p className="mt-3 text-xs text-tinta-suave">
                      {post.author_username}
                      <span className="mx-2 text-humo">|</span>
                      {fecha(post.created_at)}
                      <span className="mx-2 text-humo">|</span>
                      {plural(post.comments_count, "comentario", "comentarios")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambio={setPagina} />
        </>
      ) : (
        <div className="mt-8">
          <Vacio
            titulo="No hay publicaciones con ese filtro"
            texto="Prueba con otra categoría o escribe la primera."
          />
        </div>
      )}
    </div>
  );
}
