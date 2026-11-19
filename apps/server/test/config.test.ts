import { describe, expect, it } from "bun:test";
import { socialProviders } from "../src/auth/auth.ts";
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

describe("the beta key", () => {
  const base = {
    DATABASE_URL: "postgres://nookly:nookly@127.0.0.1:5433/nookly",
    AUTH_SECRET: "x".repeat(32),
  };
  it("is off when empty or blank", () => {
    expect(loadConfig(base).BETA_KEY).toBeUndefined();
    expect(loadConfig({ ...base, BETA_KEY: "  " }).BETA_KEY).toBeUndefined();
  });
  it("keeps its value, trimmed", () => {
    expect(loadConfig({ ...base, BETA_KEY: " abc " }).BETA_KEY).toBe("abc");
  });
  it("shuts providers out of sign up while it is set", () => {
    const env = { ...base, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" };
    expect(socialProviders(loadConfig(env)).github?.disableSignUp).toBe(false);
    expect(socialProviders(loadConfig({ ...env, BETA_KEY: "k" })).github?.disableSignUp).toBe(true);
  });
});
