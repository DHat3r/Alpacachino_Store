import axios from "axios";

import { useAuth } from "../store/auth";

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

api.interceptors.request.use((config) => {
  // El store es la fuente de verdad; localStorage es el respaldo duradero.
  const token =
    useAuth.getState().accessToken ?? localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      useAuth.getState().logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
