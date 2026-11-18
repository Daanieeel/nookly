import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { redact } from "../src/log.ts";
import { RateLimiter } from "../src/security/rate-limit.ts";
import {
  DESKTOP,
  MemoryTokens,
  PASSWORD,
  type TestServer,
  startServer,
  until,
  HOOK_TIMEOUT,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
}, HOOK_TIMEOUT);
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

describe("the server", () => {
  it("reports its health", async () => {
    const response = await fetch(`${server.baseUrl}/health`);
    expect(await response.json()).toEqual({ status: "ok", version: expect.any(String) });
  });

  it("describes its API from the routes", async () => {
    const spec = await (await fetch(`${server.baseUrl}/docs/json`)).json();
    for (const path of [
      "/v1/auth/providers",
      "/v1/sync/push",
      "/v1/sync/pull",
      "/v1/shares",
      "/v1/sessions/{id}",
    ]) {
      expect(Object.keys(spec.paths)).toContain(path);
    }
    const push = spec.paths["/v1/sync/push"].post;
    expect(JSON.stringify(push.requestBody)).toContain("baseClocks");
    // The pages email links open aren't part of the API.
    expect(Object.keys(spec.paths)).not.toContain("/verify-email");
  });

  it("answers unknown routes with a JSON 404", async () => {
    const response = await fetch(`${server.baseUrl}/v1/nothing`);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not_found");
  });
});

describe("the live socket", () => {
  async function open() {
    const socket = new WebSocket(`${server.baseUrl.replace("http", "ws")}/v1/sync/ws`);
    const messages: string[] = [];
    let closed = false;
    socket.addEventListener("message", (e) => messages.push(String(e.data)));
    socket.addEventListener("close", () => {
      closed = true;
    });
    await new Promise((resolve) => socket.addEventListener("open", resolve));
    return { socket, messages, closed: () => closed };
  }

  it("closes on a bad token", async () => {
    const live = await open();
    live.socket.send(JSON.stringify({ type: "hello", token: "nonsense" }));
    await until(live.closed, "the socket to close");
    expect(live.messages).toEqual([JSON.stringify({ type: "error", code: "unauthorized" })]);
  });

  it("signs in with the first message and answers pings", async () => {
    const tokens = new MemoryTokens();
    const api = server.client(tokens);
    await api.signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const live = await open();
    live.socket.send(JSON.stringify({ type: "hello", token: tokens.token }));
    await until(() => live.messages.includes(JSON.stringify({ type: "ready" })), "ready");
    live.socket.send(JSON.stringify({ type: "ping" }));
    await until(() => live.messages.includes(JSON.stringify({ type: "pong" })), "pong");
    expect(server.hub.connected((await api.me()).id)).toBe(1);
    live.socket.close();
  });

  it("refuses messages it doesn't know", async () => {
    const live = await open();
    live.socket.send("not json at all");
    await until(() => live.messages.length > 0, "an answer");
    expect(JSON.parse(live.messages[0]).code).toBe("invalid_message");
    live.socket.close();
  });
});

describe("pieces", () => {
  it("redacts secrets by field name, however deep", () => {
    expect(
      redact({ email: "a@b.co", password: "x", nested: { refreshToken: "y", ok: 1 } }),
    ).toEqual({
      email: "a@b.co",
      password: "[redacted]",
      nested: { refreshToken: "[redacted]", ok: 1 },
    });
  });

  it("rate limits per key and window", () => {
    let time = 0;
    const limiter = new RateLimiter(2, 1_000, () => time);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("b")]).toEqual([null, null, null]);
    expect(limiter.take("a")).toBe(1);
    time = 1_000;
    expect(limiter.take("a")).toBeNull();
  });
});
