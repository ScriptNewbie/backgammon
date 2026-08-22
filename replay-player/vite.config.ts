import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
    fs: { allow: [here, path.resolve(here, "../ts-core")] },
  },
  resolve: {
    alias: {
      "ts-core": path.resolve(here, "../ts-core/src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["ts-core"],
  },
});
