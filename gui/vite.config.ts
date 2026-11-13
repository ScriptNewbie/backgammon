import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** game-engine HTTP base. Compose sets it; the engine publishes port 3000 on the host. */
const engineUrl = process.env.ENGINE_URL ?? "http://host.docker.internal:3000";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
    fs: { allow: [here, path.resolve(here, "../ts-core"), path.resolve(here, "../board")] },
    proxy: {
      "/api/engine": {
        target: engineUrl,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/engine/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "ts-core": path.resolve(here, "../ts-core/src/index.ts"),
      "board/element": path.resolve(here, "../board/src/element.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["ts-core", "board"],
  },
});
