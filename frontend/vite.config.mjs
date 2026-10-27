import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// base "./" = rutas relativas: funciona en GitHub Pages, en cualquier carpeta o abriendo build/ con un servidor simple.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { port: 3000 },
  build: { outDir: "build" },
});
