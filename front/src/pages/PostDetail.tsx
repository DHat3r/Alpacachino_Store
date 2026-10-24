import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../store/auth";
import { api } from "../api/client";

interface Post {
  id: number;
  author_id: number;
  author_username: string;
  title: string;
  body: string;
  product_id: string | null;
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
  const [commentBody, setCommentBody] = useState("");

  const { data: post, isLoading: postLoading, error: postError } = useQuery({
    queryKey: ["forum-post", id],
    queryFn: async () => {
      const res = await api.get(`/forum/posts/${id}`);
      return res.data as Post;
    },
    enabled: !!id,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ["forum-comments", id],
    queryFn: async () => {
      const res = await api.get(`/forum/posts/${id}/comments`);
      return res.data as Comment[];
    },
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post(`/forum/posts/${id}/comments`, { body });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-comments", id] });
      setCommentBody("");
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/forum/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-posts"] });
      navigate("/foro");
    },
  });

  const canEdit = isAuthenticated() && (user?.id === post?.author_id || hasRole(["admin", "moderator"]));
  const canModerate = hasRole(["admin", "moderator"]);

  if (postLoading) return <div className="p-6 animate-pulse">Cargando...</div>;
  if (postError || !post) return <div className="p-6 text-center text-red-600">Publicación no encontrada</div>;
  if (post.is_hidden && !canModerate) return <div className="p-6 text-center text-gray-500">Esta publicación ha sido ocultada</div>;

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    if (!commentBody.trim()) return;
    addCommentMutation.mutate(commentBody);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <nav className="mb-6 text-sm text-gray-500">
        <a href="/foro" className="hover:text-indigo-600">Foro</a> / {post.title}
      </nav>

      <article className="bg-white rounded-lg border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-2xl font-bold text-gray-900">{post.title}</h1>
          {post.is_pinned && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">Fijado</span>}
          {post.is_locked && <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Cerrado</span>}
          {post.rating && (
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
              ⭐ {post.rating}/5
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <span>{post.author_username}</span>
          <span>·</span>
          <span>{new Date(post.created_at).toLocaleString("es-CL")}</span>
          {post.updated_at !== post.created_at && (
            <>
              <span>·</span>
              <span>Editado: {new Date(post.updated_at).toLocaleString("es-CL")}</span>
            </>
          )}
        </div>
        <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
          {post.body}
        </div>

        <div className="mt-4 flex gap-2">
          {canEdit && (
            <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">
              Editar
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                if (confirm("¿Eliminar esta publicación?")) deletePostMutation.mutate();
              }}
              className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
            >
              Eliminar
            </button>
          )}
        </div>
      </article>

      <section className="mb-6">
        <h2 className="text-xl font-bold mb-4">Comentarios ({comments.length})</h2>

        {isAuthenticated() && !post.is_locked && (
          <form onSubmit={handleAddComment} className="mb-6">
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
              placeholder="Escribe un comentario..."
              required
            />
            <button
              type="submit"
              disabled={addCommentMutation.isPending || !commentBody.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {addCommentMutation.isPending ? "Publicando..." : "Comentar"}
            </button>
          </form>
        )}

        {!isAuthenticated() && !post.is_locked && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg text-center text-gray-600">
            <a href="/login" className="text-indigo-600 hover:text-indigo-500">Inicia sesión</a> para comentar
          </div>
        )}

        {post.is_locked && (
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg text-center text-yellow-700">
            Esta publicación está cerrada a nuevos comentarios
          </div>
        )}

        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-sm">
                  {comment.author_username[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{comment.author_username}</span>
                    <span className="text-sm text-gray-500">{new Date(comment.created_at).toLocaleString("es-CL")}</span>
                  </div>
                  <p className="text-gray-700">{comment.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {comments.length === 0 && (
          <p className="text-center text-gray-500 py-8">No hay comentarios aún. ¡Sé el primero en comentar!</p>
        )}
      </section>
    </div>
  );
}