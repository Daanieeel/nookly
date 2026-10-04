import process from "node:process";
import { defineConfig } from "vitest/config";

// Every date and time test reads the same wall clock, wherever it runs.
process.env.TZ = "UTC";

// Unit and component tests in jsdom. `#/` resolves through the package's own `imports`
// field and `@nookly/ui` through its `exports`, exactly as in the app bundle.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
