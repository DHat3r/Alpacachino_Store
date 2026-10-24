import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
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

export default function Forum() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["forum-posts"],
    queryFn: async () => {
      const res = await api.get("/forum/posts");
      return res.data as Post[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; body: string }) => {
      const res = await api.post("/forum/posts", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-posts"] });
      setShowCreate(false);
      setTitle("");
      setBody("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    if (!title.trim() || !body.trim()) return;
    createMutation.mutate({ title, body });
  };

  if (isLoading) return <div className="p-6 animate-pulse">Cargando foro...</div>;
  if (error) return <div className="p-6 text-center text-red-600">Error cargando foro</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Foro Comunitario</h1>
        {isAuthenticated() && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Nueva publicación
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-medium mb-4">Nueva publicación</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={160}
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={6}
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending ? "Publicando..." : "Publicar"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {data?.map((post) => (
          <Link key={post.id} to={`/foro/${post.id}`} className="block">
            <div className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                  {post.author_username[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 truncate">{post.title}</h3>
                    {post.is_pinned && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">Fijado</span>}
                    {post.is_locked && <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Cerrado</span>}
                    {post.rating && (
                      <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                        ⭐ {post.rating}/5
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 line-clamp-2 mb-2">{post.body}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{post.author_username}</span>
                    <span>·</span>
                    <span>{new Date(post.created_at).toLocaleDateString("es-CL")}</span>
                    <span>·</span>
                    <span>{post.comments_count} comentarios</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {(!data || data.length === 0) && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No hay publicaciones aún</p>
          {isAuthenticated() && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Crear la primera publicación
            </button>
          )}
        </div>
      )}
    </div>
  );
}