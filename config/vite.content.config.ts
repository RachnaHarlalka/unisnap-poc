import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content scripts must be single-file IIFEs (no ES imports). Selected with
// CONTENT=main-world | bridge; run after the main build (emptyOutDir: false).
const entry = process.env.CONTENT;
if (entry !== "main-world" && entry !== "bridge") {
  throw new Error("Set CONTENT=main-world or CONTENT=bridge");
}

export default defineConfig({
  root: resolve(__dirname, ".."),
  resolve: { alias: { "@": resolve(__dirname, "../src") } },
  // GPTK uses Tampermonkey's unsafeWindow; in the MAIN world it is just window.
  define: { unsafeWindow: "window" },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, `../src/content/${entry}.ts`),
      formats: ["iife"],
      name: `unisnap_${entry.replace("-", "_")}`,
      fileName: () => `${entry}.js`,
    },
  },
});
