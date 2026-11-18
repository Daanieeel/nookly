import { describe, expect, it } from "vitest";
import { PRODUCTION_SERVER, defaultServer } from "./server-address.ts";

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
