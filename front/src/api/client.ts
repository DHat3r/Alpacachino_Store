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

/** Una sola renovación simultánea aunque fallen varias peticiones a la vez. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh =
    useAuth.getState().refreshToken ?? localStorage.getItem("refresh_token");
  if (!refresh) return null;

  try {
    const { data } = await axios.post(`${apiBase}/auth/refresh`, {
      refresh_token: refresh,
    });
    useAuth.getState().setTokens(data.access_token, data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;
    const isAuthCall = original?.url?.includes("/auth/");

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthCall
    ) {
      original._retry = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;

      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }

      useAuth.getState().logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);
