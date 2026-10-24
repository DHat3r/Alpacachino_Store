import { existsSync } from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Destino del proxy /api:
 * - Dentro de Docker el backend es el servicio `api` del compose (puerto interno 8000).
 * - En el equipo, ese nombre no resuelve ("ENOTFOUND api"): hay que usar el puerto
 *   publicado en localhost (8001).
 * `VITE_PROXY_TARGET` permite forzar cualquier otro destino.
 */
const enDocker = existsSync("/.dockerenv");
const destinoApi =
  process.env.VITE_PROXY_TARGET ?? (enDocker ? "http://api:8000" : "http://localhost:8001");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: { usePolling: true }, // hot reload fiable con volúmenes en Windows
    proxy: {
      "/api": {
        target: destinoApi,
        changeOrigin: true,
      },
    },
  },
});
