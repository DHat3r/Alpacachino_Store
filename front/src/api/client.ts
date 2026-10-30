import axios from "axios";

/**
 * Base de la API:
 * - En desarrollo/Docker se usa el proxy `/api` (mismo origen, sin CORS).
 * - En producción (Vercel) se define `VITE_API_URL=https://api.dominio.cl`
 *   y se resuelve a `https://api.dominio.cl/api`.
 */
const rawBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const apiBase = rawBase
  ? rawBase.endsWith("/api")
    ? rawBase
    : `${rawBase}/api`
  : "/api";

export const api = axios.create({
  baseURL: apiBase,
});
