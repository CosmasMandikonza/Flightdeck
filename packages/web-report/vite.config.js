import { defineConfig } from "vite";
import path from "node:path";

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const base = repo ? `/${repo}/` : "/";

export default defineConfig({
  root: "./packages/web-report",
  base,
  server: { port: 5174, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true }
});
