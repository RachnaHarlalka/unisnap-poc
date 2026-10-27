import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Builds the dashboard page and the service worker. The two content scripts need single-file
// output and are built by vite.content.config.ts afterwards (see the "build" script).
export default defineConfig({
  root: resolve(__dirname, ".."),
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "../src") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, "../dashboard.html"),
        background: resolve(__dirname, "../src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
