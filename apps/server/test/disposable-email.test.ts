import { describe, expect, it } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { isDisposableEmail } from "../src/security/disposable-email.ts";

describe("disposable email addresses", () => {
  it("knows the throwaway mail services", () => {
    expect(isDisposableEmail("ada@mailinator.com")).toBe(true);
    expect(isDisposableEmail("ada@guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("ada@10minutemail.com")).toBe(true);
  });

  it("ignores case and stray spaces", () => {
    expect(isDisposableEmail("  Ada@MAILINATOR.com ")).toBe(true);
  });

  it("catches a subdomain of a listed domain", () => {
    expect(isDisposableEmail("ada@inbox.mailinator.com")).toBe(true);
  });

  it("lets real mail providers and look alikes through", () => {
    expect(isDisposableEmail("ada@gmail.com")).toBe(false);
    expect(isDisposableEmail("ada@icloud.com")).toBe(false);
    expect(isDisposableEmail("ada@example.com")).toBe(false);
    expect(isDisposableEmail("ada@mailinator.com.example.org")).toBe(false);
  });

  it("does not trip on a bad address", () => {
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("no-at-sign")).toBe(false);
  });

  it("is off by default and switched on by BLOCK_DISPOSABLE_EMAIL", () => {
    const base = {
      DATABASE_URL: "postgres://nookly:nookly@127.0.0.1:5433/nookly",
      AUTH_SECRET: "x".repeat(32),
    };
    expect(loadConfig(base).BLOCK_DISPOSABLE_EMAIL).toBe(false);
    expect(loadConfig({ ...base, BLOCK_DISPOSABLE_EMAIL: "true" }).BLOCK_DISPOSABLE_EMAIL).toBe(
      true,
    );
  });
});
