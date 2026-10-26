import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// base "./" = rutas relativas: funciona en GitHub Pages, en cualquier carpeta o abriendo dist/ con un servidor simple.
export default defineConfig({
  base: "./",
  plugins: [react({ include: /\.(js|jsx)$/ })],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // El código usa JSX dentro de archivos .js (herencia de Create React App).
  esbuild: { loader: "jsx", include: /src\/.*\.jsx?$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
  server: { port: 3000 },
  build: { outDir: "build" },
});
