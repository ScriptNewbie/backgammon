import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Custom element bundle. A host page needs only this script. */
export default defineConfig({
  resolve: {
    alias: {
      "ts-core": path.resolve(here, "../ts-core/src/index.ts"),
    },
  },
  build: {
    outDir: "dist/element",
    emptyOutDir: true,
    lib: {
      entry: path.resolve(here, "src/element.ts"),
      formats: ["es"],
      fileName: "element",
    },
    rollupOptions: {
      external: [],
    },
  },
});
