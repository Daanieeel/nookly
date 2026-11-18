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
    // A shared CI runner can be many times slower than a laptop: a test that works still ends
    // as fast, but may take longer before it gives up there.
    testTimeout: process.env.CI ? 20_000 : 5_000,
    // `bun run coverage:js`. A report to read, not a gate: no thresholds.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage",
    },
  },
});
