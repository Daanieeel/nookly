import { describe, expect, it } from "bun:test";
import { loadConfig } from "../src/config.ts";
import pkg from "../package.json" with { type: "json" };

describe("the config", () => {
  it("reports the version in package.json, however the server was started", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://nookly:nookly@127.0.0.1:5433/nookly",
      AUTH_SECRET: "x".repeat(32),
    });
    expect(config.version).toBe(pkg.version);
  });
});
