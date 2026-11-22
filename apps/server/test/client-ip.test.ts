import { describe, expect, it } from "bun:test";
import { clientIp } from "../src/security/client-ip.ts";

describe("the client address", () => {
  it("is the connection's when no proxy is trusted", () => {
    expect(clientIp("1.1.1.1", "9.9.9.9", false)).toBe("9.9.9.9");
  });

  it("is the one the proxy appended, never one the client wrote before it", () => {
    expect(clientIp("6.6.6.6, 7.7.7.7, 2.2.2.2", "10.0.0.1", true)).toBe("2.2.2.2");
    expect(clientIp("2.2.2.2", "10.0.0.1", true)).toBe("2.2.2.2");
  });

  it("counts the hops from the right when more than one proxy is in front", () => {
    expect(clientIp("6.6.6.6, 2.2.2.2, 10.0.0.5", "10.0.0.1", true, 2)).toBe("2.2.2.2");
  });

  it("falls back to the connection when the header is missing or too short", () => {
    expect(clientIp(null, "9.9.9.9", true)).toBe("9.9.9.9");
    expect(clientIp("2.2.2.2", "9.9.9.9", true, 2)).toBe("9.9.9.9");
    expect(clientIp(undefined, undefined, false)).toBe("unknown");
  });
});
