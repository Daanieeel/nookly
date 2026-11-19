import { describe, expect, it } from "vitest";
import { PRODUCTION_SERVER, asksForBetaKey, defaultServer } from "./server-address.ts";

// A released app connects to Nookly's own server by default; a development build to the
// one `bun run stack` runs on this machine.
describe("the server an app offers first", () => {
  it("is Nookly's own in a released app", () => {
    expect(PRODUCTION_SERVER).toBe("https://sync.nookly.work");
    expect(defaultServer({ dev: false })).toBe(PRODUCTION_SERVER);
  });

  it("is this machine's in development, the emulator's own address on Android", () => {
    expect(defaultServer({ dev: true })).toBe("http://localhost:3000");
    expect(defaultServer({ dev: true, android: true })).toBe("http://10.0.2.2:3000");
  });
});

// Nookly's own server is a closed beta, so creating an account there needs the key. A server
// someone runs themselves decides for itself, and says so when it wants one.
describe("which servers ask for the beta key up front", () => {
  it("is Nookly's own, however the address is written", () => {
    expect(asksForBetaKey(PRODUCTION_SERVER)).toBe(true);
    expect(asksForBetaKey("https://sync.nookly.work/")).toBe(true);
    expect(asksForBetaKey(" HTTPS://Sync.Nookly.work ")).toBe(true);
  });

  it("is no other server", () => {
    expect(asksForBetaKey("http://localhost:3000")).toBe(false);
    expect(asksForBetaKey("https://sync.example.com")).toBe(false);
  });
});
