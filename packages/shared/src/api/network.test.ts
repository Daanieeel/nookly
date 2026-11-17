import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client.ts";
import { NetworkError } from "../sync/client.ts";

/// What a phone throws when the server isn't there.
const unreachable = () => Promise.reject(new TypeError("fetch failed: Could not connect"));

function client() {
  return new ApiClient({
    baseUrl: "http://10.0.0.5:3000",
    tokens: { load: async () => "token", save: async () => {} },
    fetch: unreachable,
  });
}

const phone = { name: "Phone", platform: "ios" } as const;

describe("an unreachable server", () => {
  it("says so in plain words, not with the system's error", async () => {
    const attempt = client().signIn("ada", "secret", phone);
    await expect(attempt).rejects.toBeInstanceOf(NetworkError);
    await expect(attempt).rejects.toThrow(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it("keeps the system's error as the cause", async () => {
    await expect(client().signIn("ada", "secret", phone)).rejects.toHaveProperty(
      "cause",
      expect.any(TypeError),
    );
  });
});

// A request whose connection died without a word (the laptop slept, the phone changed
// network) never answers. Sync waits for each request before the next, so one that hangs
// would hold every later sync back until the app restarts.
describe("a request that never answers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is given up as unreachable after a while", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const api = new ApiClient({
      baseUrl: "http://10.0.0.5:3000",
      tokens: { load: async () => "token", save: async () => {} },
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    });
    const attempt = api.syncTransport().pull({ cursors: {} });
    const settled = expect(attempt).rejects.toBeInstanceOf(NetworkError);
    await vi.advanceTimersByTimeAsync(60_000);
    await settled;
    expect(aborted).toBe(true);
  });
});
