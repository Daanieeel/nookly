import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client.ts";

/// A socket that does what the test says: opens, answers, goes quiet.
class FakeSocket {
  static all: FakeSocket[] = [];
  readonly sent: string[] = [];
  closed = false;
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  constructor() {
    FakeSocket.all.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function liveClient() {
  const api = new ApiClient({
    baseUrl: "http://nookly.test",
    tokens: { load: async () => "token", save: async () => {} },
    // SAFETY: the fake has the parts of a WebSocket the client uses.
    webSocket: () => new FakeSocket() as unknown as WebSocket,
  });
  const handlers = { onOpen: vi.fn(), onChanges: vi.fn(), onClose: vi.fn() };
  const stop = api.syncTransport().live?.(handlers);
  return { handlers, stop };
}

describe("the live channel", () => {
  it("hears a changes message", async () => {
    const { handlers } = liveClient();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.all[0];
    socket.emit("open");
    socket.emit("message", JSON.stringify({ type: "ready" }));
    socket.emit("message", JSON.stringify({ type: "changes", dataset: "own" }));
    expect(handlers.onOpen).toHaveBeenCalledOnce();
    expect(handlers.onChanges).toHaveBeenCalledOnce();
  });

  it("gives up on a connection that went silent, which a phone can't tell from a quiet one", async () => {
    // A server that vanished, or a network that changed, can leave the socket looking
    // open for ever; no close event comes and no change is ever heard again.
    const { handlers } = liveClient();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.all[0];
    socket.emit("open");
    socket.emit("message", JSON.stringify({ type: "ready" }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.closed).toBe(true);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it("keeps a connection that answers its pings", async () => {
    const { handlers } = liveClient();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.all[0];
    socket.emit("open");
    socket.emit("message", JSON.stringify({ type: "ready" }));
    for (let second = 0; second < 120; second += 5) {
      await vi.advanceTimersByTimeAsync(5_000);
      socket.emit("message", JSON.stringify({ type: "pong" }));
    }
    expect(socket.closed).toBe(false);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });
});
