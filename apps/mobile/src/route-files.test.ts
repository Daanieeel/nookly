import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/// Every file under `src/app` is a route the bundler takes into the app (expo-router's
/// `require.context`), tests included. A test there, or a route importing the test helpers,
/// pulls Node's own modules (`node:sqlite` from `@nookly/shared/testing`) into the build,
/// which then fails with "Unable to resolve module node:sqlite".
const APP = join(__dirname, "app");
const files = readdirSync(APP, { recursive: true, encoding: "utf8" });

/// What only Jest on Node can load: the test helpers and Node's built in modules.
const TEST_ONLY = [
  /from\s+["']node:/,
  /from\s+["'][./]*test\//,
  /from\s+["']@nookly\/shared\/testing/,
];

describe("the route folder", () => {
  it("holds no tests", () => {
    expect(files.filter((f) => /\.test\.tsx?$/.test(f))).toEqual([]);
  });

  it("imports nothing that only runs in a test", () => {
    const offending = files
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => TEST_ONLY.some((p) => p.test(readFileSync(join(APP, f), "utf8"))));
    expect(offending).toEqual([]);
  });
});
