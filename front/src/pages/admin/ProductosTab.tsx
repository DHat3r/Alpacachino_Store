import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import Alpaca from "../../components/Alpaca";
import { Aviso, Cargando, ErrorCarga, Paginacion } from "../../components/ui";
import { clp } from "../../lib/format";
import { mensajeError, type Categoria, type Pagina, type ProductoAdmin } from "./comun";

interface Borrador {
  sku: string;
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  description: string;
  price: string;
  category_id: string;
  stock: string;
  cover_url: string;
}

const VACIO: Borrador = {
  sku: "",
  title: "",
  author: "",
  publisher: "",
  isbn: "",
  description: "",
  price: "",
  category_id: "",
  stock: "0",
  cover_url: "",
};

const MAX_MB = 2;

function aBorrador(p: ProductoAdmin): Borrador {
  return {
    sku: p.sku,
    title: p.title,
    author: p.author ?? "",
    publisher: p.publisher ?? "",
    isbn: p.isbn ?? "",
    description: p.description ?? "",
    price: String(Math.round(Number(p.price))),
    category_id: p.category_id ?? "",
    stock: String(p.inventory_quantity),
    cover_url: p.cover_url ?? "",
  };
}

export default function ProductosTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error" | "atencion"; texto: string } | null>(null);
  // null = formulario cerrado; "nuevo" = crear; si no, el id del producto en edición.
  const [formulario, setFormulario] = useState<null | "nuevo" | ProductoAdmin>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-productos", q, pagina],
    queryFn: async () => {
      const res = await api.get("/products/admin", {
        params: { page: pagina, size: 20, ...(q ? { q } : {}) },
      });
      return res.data as Pagina<ProductoAdmin>;
    },
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["admin-productos"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["home-novedades"] });
    qc.invalidateQueries({ queryKey: ["product"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const cambiarActivo = useMutation({
    mutationFn: (p: ProductoAdmin) =>
      p.is_active
        ? api.delete(`/products/admin/${p.id}`)
        : api.patch(`/products/admin/${p.id}`, { is_active: true }),
    onSuccess: refrescar,
    onError: (e) => setAviso({ tono: "error", texto: mensajeError(e, "No se pudo cambiar el estado.") }),
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1">
          <label className="etiqueta-campo" htmlFor="prod-q">Buscar por título o SKU</label>
          <input
            id="prod-q"
            className="campo"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPagina(1);
            }}
          />
        </div>
        <button className="btn btn-primario" onClick={() => setFormulario("nuevo")}>
          Nuevo producto
        </button>
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      {formulario && (
        <FormularioProducto
          key={formulario === "nuevo" ? "nuevo" : formulario.id}
          producto={formulario === "nuevo" ? null : formulario}
          onCerrar={() => setFormulario(null)}
          onGuardado={(texto, conAdvertencia) => {
            setAviso({ tono: conAdvertencia ? "atencion" : "ok", texto });
            setFormulario(null);
            refrescar();
          }}
        />
      )}

      {isLoading && <Cargando texto="Cargando productos" />}
      {error && <ErrorCarga />}

      {data && data.items.length === 0 && (
        <p className="panel px-6 py-10 text-center text-tinta-suave">No hay productos con ese filtro.</p>
      )}

      {data && data.items.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-papel text-tinta-suave">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Producto</th>
                <th className="px-4 py-3 text-left font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                <th className="px-4 py-3 text-right font-medium">Disponible</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-humo">
              {data.items.map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Miniatura url={p.cover_url} />
                      <div>
                        <p className="font-medium">{p.title}</p>
                        <p className="text-xs text-tinta-suave">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-tinta-suave">{p.category?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{clp(Number(p.price))}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${p.available_stock <= 0 ? "text-alerta" : ""}`}>
                    {p.available_stock}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`insignia ${p.is_active ? "bg-exito-tenue text-exito" : "bg-nube-hondo text-tinta-suave"}`}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-secundario !px-3 !py-1.5" onClick={() => setFormulario(p)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-secundario !px-3 !py-1.5"
                        disabled={cambiarActivo.isPending}
                        onClick={() => cambiarActivo.mutate(p)}
                      >
                        {p.is_active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambio={setPagina} />
    </div>
  );
}

function Miniatura({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-14 w-10 rounded-md border border-humo object-cover" />
  ) : (
    <div className="flex h-14 w-10 items-center justify-center rounded-md bg-papel-hondo">
      <Alpaca className="h-6 w-6 text-humo" />
    </div>
  );
}

/* ── Formulario de alta y edición ─────────────────────────── */

function FormularioProducto({
  producto,
  onCerrar,
  onGuardado,
}: {
  producto: ProductoAdmin | null;
  onCerrar: () => void;
  onGuardado: (texto: string, conAdvertencia?: boolean) => void;
}) {
  const editando = producto !== null;
  const [b, setB] = useState<Borrador>(producto ? aBorrador(producto) : VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const vistaPrevia = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);

  const { data: categorias } = useQuery({
    queryKey: ["admin-categorias-activas"],
    queryFn: async () => {
      const res = await api.get("/products/categories");
      return res.data as Categoria[];
    },
  });

  const campo = (k: keyof Borrador) => ({
    value: b[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setB((prev) => ({ ...prev, [k]: e.target.value })),
  });

  const elegirArchivo = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`La imagen pesa más de ${MAX_MB} MB.`);
      if (inputArchivo.current) inputArchivo.current.value = "";
      return;
    }
    setArchivo(f);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const precio = Number(b.price);
    if (!b.title.trim()) return setError("Falta el título.");
    if (!editando && !b.sku.trim()) return setError("Falta el SKU.");
    if (!Number.isFinite(precio) || precio < 0 || b.price === "") return setError("El precio no es válido.");

    const comunes = {
      title: b.title.trim(),
      author: b.author.trim() || null,
      publisher: b.publisher.trim() || null,
      isbn: b.isbn.trim() || null,
      description: b.description.trim() || null,
      price: precio,
      category_id: b.category_id || null,
      cover_url: b.cover_url.trim() || null,
    };

    setGuardando(true);
    let id = producto?.id ?? "";
    try {
      if (editando) {
        await api.patch(`/products/admin/${id}`, comunes);
      } else {
        const res = await api.post("/products/admin", {
          ...comunes,
          sku: b.sku.trim(),
          stock: Math.max(0, Math.floor(Number(b.stock) || 0)),
        });
        id = res.data.id;
      }
    } catch (err) {
      setGuardando(false);
      return setError(mensajeError(err, "No se pudo guardar el producto."));
    }

    // La portada va aparte: el producto ya existe aunque la subida falle.
    if (archivo) {
      try {
        const datos = new FormData();
        datos.append("file", archivo);
        await api.post(`/products/admin/${id}/cover`, datos);
      } catch (err) {
        setGuardando(false);
        return onGuardado(
          `Producto guardado, pero la portada no se subió: ${mensajeError(err, "error desconocido")}`,
          true,
        );
      }
    }

    setGuardando(false);
    onGuardado(editando ? "Producto actualizado." : `Producto «${b.title.trim()}» creado.`);
  };

  return (
    <form onSubmit={guardar} className="panel space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-extrabold">
          {editando ? `Editar «${producto?.title}»` : "Nuevo producto"}
        </h2>
        <button type="button" className="btn btn-fantasma" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="etiqueta-campo" htmlFor="p-sku">SKU</label>
          <input id="p-sku" className="campo" maxLength={40} disabled={editando} {...campo("sku")} />
          {editando && <p className="mt-1 text-xs text-tinta-suave">El SKU no se puede cambiar.</p>}
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-titulo">Título</label>
          <input id="p-titulo" className="campo" maxLength={200} {...campo("title")} />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-autor">Autor</label>
          <input id="p-autor" className="campo" maxLength={120} {...campo("author")} />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-editorial">Editorial</label>
          <input id="p-editorial" className="campo" maxLength={120} {...campo("publisher")} />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-isbn">ISBN</label>
          <input id="p-isbn" className="campo" maxLength={20} {...campo("isbn")} />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-cat">Categoría</label>
          <select id="p-cat" className="campo" {...campo("category_id")}>
            <option value="">Sin categoría</option>
            {categorias?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-precio">Precio (CLP)</label>
          <input id="p-precio" className="campo" type="number" min={0} step={1} {...campo("price")} />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="p-stock">Stock inicial</label>
          <input id="p-stock" className="campo" type="number" min={0} disabled={editando} {...campo("stock")} />
          {editando && (
            <p className="mt-1 text-xs text-tinta-suave">
              El stock se ajusta en la pestaña Inventario (queda registro de cada cambio).
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="etiqueta-campo" htmlFor="p-desc">Descripción</label>
        <textarea id="p-desc" className="campo min-h-24" {...campo("description")} />
      </div>

      <fieldset className="rounded-xl border border-humo p-4">
        <legend className="px-2 text-sm font-medium text-tinta-suave">Portada</legend>
        <div className="flex flex-wrap items-start gap-5">
          <Miniatura url={vistaPrevia ?? (b.cover_url || null)} />
          <div className="min-w-64 flex-1 space-y-3">
            <div>
              <label className="etiqueta-campo" htmlFor="p-archivo">
                Subir imagen (JPG, PNG o WebP, hasta {MAX_MB} MB)
              </label>
              <input
                id="p-archivo"
                ref={inputArchivo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-morado-tenue file:px-4 file:py-2 file:font-semibold file:text-morado-texto"
                onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-tinta-suave">
                Se convierte a WebP y se guarda en Supabase Storage. Si el almacenamiento no está
                configurado, pega una URL abajo.
              </p>
            </div>
            <div>
              <label className="etiqueta-campo" htmlFor="p-url">…o pega la URL de una imagen</label>
              <input
                id="p-url"
                className="campo"
                maxLength={500}
                placeholder="https://…"
                {...campo("cover_url")}
              />
            </div>
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="btn btn-primario" disabled={guardando}>
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}
