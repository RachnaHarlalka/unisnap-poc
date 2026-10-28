import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

// Short git commit (+dirty when there are uncommitted changes), written into every performance report.
const git = (cmd: string) => execSync(cmd, { cwd: import.meta.dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
const buildId = (() => {
  try {
    return git("git rev-parse --short HEAD") + (git("git status --porcelain") ? "+dirty" : "");
  } catch {
    return "unknown";
  }
})();

// Builds the dashboard page and the service worker. The two content scripts need single-file
// output and are built by vite.content.config.ts afterwards (see the "build" script).
export default defineConfig({
  root: resolve(import.meta.dirname, ".."),
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(import.meta.dirname, "../dashboard.html"),
        background: resolve(import.meta.dirname, "../src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
