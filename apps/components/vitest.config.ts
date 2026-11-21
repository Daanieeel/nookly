import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests and the popovers' axe checks, in jsdom. `@/` is `src/`, as in tsconfig.json.
export default defineConfig({
  // tsconfig.json keeps JSX for Next to compile; the tests compile it themselves.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    testTimeout: process.env.CI ? 20_000 : 5_000,
  },
});
