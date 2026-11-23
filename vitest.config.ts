import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Components are rendered to HTML in tests (public job page): React's automatic JSX runtime.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: "" },
    // next-auth imports "next/server" without an extension: let Vite resolve it (middleware tests).
    server: { deps: { inline: ["next-auth"] } },
  },
});
