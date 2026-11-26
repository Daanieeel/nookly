import { describe, expect, it } from "vitest";
import { retryAfterSeconds, tooManyRequests } from "./rate-limit.ts";

describe("an answer to too many requests", () => {
  it("says how long to wait, which the apps read back", () => {
    expect(tooManyRequests(54)).toBe("Too many requests. Try again in 54 seconds.");
    expect(retryAfterSeconds(tooManyRequests(54))).toBe(54);
  });

  it("is not read into any other failure", () => {
    expect(retryAfterSeconds("This file isn't on the server.")).toBeNull();
  });
});
