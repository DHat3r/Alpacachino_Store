import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: { usePolling: true }, // hot reload fiable con volúmenes en Windows
    proxy: {
      "/api": {
        target: "http://api:8000", // nombre del servicio en docker-compose
        changeOrigin: true,
      },
    },
  },
});
