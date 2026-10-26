import { isAxiosError } from "axios";

/** Mensaje legible a partir de un error de la API (FastAPI devuelve `detail`). */
export function mensajeError(err: unknown, porDefecto: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) {
      return String(detail[0].msg).replace(/^Value error, /, "");
    }
  }
  return porDefecto;
}

export interface Categoria {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
}

export interface ProductoAdmin {
  id: string;
  sku: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  description: string | null;
  price: string | number;
  cover_url: string | null;
  category_id: string | null;
  category: Categoria | null;
  inventory_quantity: number;
  inventory_reserved: number;
  available_stock: number;
  is_active: boolean;
}

export interface Pagina<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
