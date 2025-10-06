import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../.."); // baseline_flightdeck root
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  root: ".",
  base,
  server: {
    port: 5173,
    open: true,
    fs: { allow: [repoRoot] }
  },
  build: { outDir: "dist", emptyOutDir: true }
});
