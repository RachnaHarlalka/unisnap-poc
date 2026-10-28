import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content scripts must be single-file IIFEs (no ES imports). Selected with
// CONTENT=main-world | bridge; run after the main build (emptyOutDir: false).
const entry = process.env.CONTENT;
if (entry !== "main-world" && entry !== "bridge") {
  throw new Error("Set CONTENT=main-world or CONTENT=bridge");
}

export default defineConfig({
  root: resolve(import.meta.dirname, ".."),
  resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
  // GPTK uses Tampermonkey's unsafeWindow; in the MAIN world it is just window.
  define: { unsafeWindow: "window" },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, `../src/content/${entry}.ts`),
      formats: ["iife"],
      name: `unisnap_${entry.replace("-", "_")}`,
      fileName: () => `${entry}.js`,
    },
  },
});
