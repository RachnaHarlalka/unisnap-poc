import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  define: { __BUILD_ID__: JSON.stringify("test") },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
