import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" -> "./*" path alias already declared in tsconfig.json.
// Needed so app/page.tsx's "@/lib/..." imports resolve under Vitest, which
// (unlike Next's own build) does not read tsconfig paths automatically.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
