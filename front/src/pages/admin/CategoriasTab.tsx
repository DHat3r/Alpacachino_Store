import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { Aviso, Cargando, ErrorCarga } from "../../components/ui";
import { mensajeError, type Categoria } from "./comun";

export default function CategoriasTab() {
  const qc = useQueryClient();
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [edNombre, setEdNombre] = useState("");
  const [edDescripcion, setEdDescripcion] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-categorias"],
    queryFn: async () => {
      const res = await api.get("/products/categories", {
        params: { include_inactive: true },
      });
      return res.data as Categoria[];
    },
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["admin-categorias"] });
    qc.invalidateQueries({ queryKey: ["categorias"] });
  };

  const crear = useMutation({
    mutationFn: () =>
      api.post("/products/admin/categories", {
        name: nombre.trim(),
        description: descripcion.trim() || null,
      }),
    onSuccess: () => {
      setAviso({ tono: "ok", texto: `Categoría «${nombre.trim()}» creada.` });
      setNombre("");
      setDescripcion("");
      refrescar();
    },
    onError: (e) => setAviso({ tono: "error", texto: mensajeError(e, "No se pudo crear la categoría.") }),
  });

  const guardar = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/products/admin/categories/${id}`, {
        name: edNombre.trim(),
        description: edDescripcion.trim() || null,
      }),
    onSuccess: () => {
      setAviso({ tono: "ok", texto: "Categoría actualizada." });
      setEditando(null);
      refrescar();
    },
    onError: (e) => setAviso({ tono: "error", texto: mensajeError(e, "No se pudo guardar.") }),
  });

  const cambiarActiva = useMutation({
    mutationFn: (c: Categoria) =>
      c.is_active
        ? api.delete(`/products/admin/categories/${c.id}`)
        : api.patch(`/products/admin/categories/${c.id}`, { is_active: true }),
    onSuccess: refrescar,
    onError: (e) => setAviso({ tono: "error", texto: mensajeError(e, "No se pudo cambiar el estado.") }),
  });

  return (
    <div className="space-y-6">
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <form
        className="panel grid gap-4 p-5 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (nombre.trim()) crear.mutate();
        }}
      >
        <div>
          <label className="etiqueta-campo" htmlFor="cat-nombre">Nueva categoría</label>
          <input
            id="cat-nombre"
            className="campo"
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Shonen"
          />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="cat-desc">Descripción (opcional)</label>
          <input
            id="cat-desc"
            className="campo"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <button className="btn btn-primario" disabled={!nombre.trim() || crear.isPending}>
          Crear
        </button>
      </form>

      {isLoading && <Cargando texto="Cargando categorías" />}
      {error && <ErrorCarga />}

      {data && (
        <div className="panel overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-papel text-tinta-suave">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium">Slug</th>
                <th className="px-4 py-3 text-left font-medium">Descripción</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-humo">
              {data.map((c) => (
                <tr key={c.id} className={c.is_active ? "" : "opacity-60"}>
                  {editando === c.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          className="campo"
                          value={edNombre}
                          onChange={(e) => setEdNombre(e.target.value)}
                          aria-label="Nombre"
                        />
                      </td>
                      <td className="px-4 py-2 text-tinta-suave">se recalcula</td>
                      <td className="px-4 py-2">
                        <input
                          className="campo"
                          value={edDescripcion}
                          onChange={(e) => setEdDescripcion(e.target.value)}
                          aria-label="Descripción"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-tinta-suave">{c.slug}</td>
                      <td className="px-4 py-3 text-tinta-suave">{c.description ?? "—"}</td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={`insignia ${
                        c.is_active ? "bg-exito-tenue text-exito" : "bg-nube-hondo text-tinta-suave"
                      }`}
                    >
                      {c.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {editando === c.id ? (
                        <>
                          <button
                            className="btn btn-primario !px-3 !py-1.5"
                            disabled={!edNombre.trim() || guardar.isPending}
                            onClick={() => guardar.mutate(c.id)}
                          >
                            Guardar
                          </button>
                          <button
                            className="btn btn-secundario !px-3 !py-1.5"
                            onClick={() => setEditando(null)}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-secundario !px-3 !py-1.5"
                            onClick={() => {
                              setEditando(c.id);
                              setEdNombre(c.name);
                              setEdDescripcion(c.description ?? "");
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-secundario !px-3 !py-1.5"
                            disabled={cambiarActiva.isPending}
                            onClick={() => cambiarActiva.mutate(c)}
                          >
                            {c.is_active ? "Desactivar" : "Activar"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
