import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client.ts";

/// A socket that does what the test says: opens, answers, goes quiet.
class FakeSocket {
  static all: FakeSocket[] = [];
  readonly sent: string[] = [];
  closed = false;
  private readonly listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

  constructor() {
    FakeSocket.all.push(this);
  }

  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
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

function liveClient(load: () => Promise<string | null> = async () => "token") {
  const api = new ApiClient({
    baseUrl: "http://nookly.test",
    tokens: { load, save: async () => {} },
    webSocket: () => new FakeSocket(),
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

  // Coming back after the server was lost: whatever stops the channel from starting must
  // say it ended, or the device never tries again and stays offline until it restarts.
  it("says it ended when the session could not be read, so it is tried again", async () => {
    // A phone's keychain can't be read while the phone is locked.
    const { handlers } = liveClient(async () => {
      throw new Error("keychain locked");
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.all).toHaveLength(0);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it("gives up on a connection that never opens, so it is tried again soon", async () => {
    // A network that changed can leave a connection attempt hanging for minutes.
    const { handlers } = liveClient();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.all[0];
    await vi.advanceTimersByTimeAsync(15_000);
    expect(socket.closed).toBe(true);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it("keeps a connection that opens and is answered in time", async () => {
    const { handlers } = liveClient();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.all[0];
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("open");
    socket.emit("message", JSON.stringify({ type: "ready" }));
    await vi.advanceTimersByTimeAsync(20_000);
    socket.emit("message", JSON.stringify({ type: "pong" }));
    expect(socket.closed).toBe(false);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });
});
