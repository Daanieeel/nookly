import { type ApiClient, ApiRequestError } from "@nookly/shared/api";
import { afterEach, describe, expect, it } from "bun:test";
import {
  DESKTOP,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  addPage,
  device,
  startServer,
  verifiedAccount,
  HOOK_TIMEOUT,
} from "./helpers.ts";

let server: TestServer;
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

async function code(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ApiRequestError) return error.status;
    throw error;
  }
}

const CLOCK = "1791934383689-000001-dev";

describe("one account never reaches another's data", () => {
  it("can't read it, write it or touch its sessions and shares", async () => {
    server = await startServer();
    const ada = await verifiedAccount(server, "ada@example.com");
    const ben = await verifiedAccount(server, "ben@example.com", PHONE);
    const adaDevice = device(ada.api);
    await adaDevice.engine.enable();
    addPage(adaDevice, "p1", "Diary", ["Secret"]);
    const planned = await adaDevice.engine.collect();
    await ada.api.push({ changes: planned.map((p) => p.change) });

    // Ben's pull only ever holds his own dataset, empty.
    const pulled = await ben.api.pull({ cursors: {} });
    expect(pulled.datasets.map((d) => [d.dataset, d.records.length])).toEqual([["own", 0]]);

    // Writing to the same keys lands in Ben's own data, never Ada's.
    await ben.api.push({
      changes: [
        {
          dataset: "own",
          table: "entities",
          pk: "p1",
          scope: "p1",
          fields: { title: "Hacked" },
          clocks: { title: "9999999999999-000001-ben" },
          baseClocks: {},
          deletedClock: null,
        },
      ],
    });
    const [adaPage] =
      await server.sql`SELECT r.fields->>'title' AS title FROM records r JOIN users u ON u.id = r.owner_id WHERE u.email = 'ada@example.com' AND r.tbl = 'entities'`;
    expect(adaPage.title).toBe("Diary");

    // A dataset that isn't Ben's is refused, made up or real.
    const { share } = await ada.api.share("p1", "cleo@example.com", "editor");
    const refused = await ben.api.push({
      changes: [
        {
          dataset: `share:${share.id}`,
          table: "blocks",
          pk: "p1-b0",
          scope: "p1",
          fields: { content: "x" },
          clocks: { content: CLOCK },
          baseClocks: {},
          deletedClock: null,
        },
      ],
    });
    expect(refused.results[0].reason).toBe("unknown-dataset");
    const otherPull = await ben.api.pull({ cursors: { [`share:${share.id}`]: 0 } });
    expect(otherPull.removed).toEqual([`share:${share.id}`]);
    expect(otherPull.datasets.map((d) => d.dataset)).toEqual(["own"]);

    // Ada's sessions and shares are out of Ben's reach.
    const [adaSession] = await ada.api.sessions();
    expect(await code(ben.api.revokeSession(adaSession.id))).toBe(404);
    expect(await code(ben.api.removeShare(share.id))).toBe(404);
    expect(await code(ben.api.changeShareRole(share.id, "viewer"))).toBe(404);
    expect(await code(ben.api.acceptShare(share.id))).toBe(404);
    expect((await ada.api.sessions()).length).toBe(1);
  });

  it("refuses every account route without a token", async () => {
    server = await startServer();
    for (const [method, path] of [
      ["GET", "/v1/account"],
      ["DELETE", "/v1/account"],
      ["GET", "/v1/sessions"],
      ["POST", "/v1/sync/push"],
      ["POST", "/v1/sync/pull"],
      ["GET", "/v1/shares/incoming"],
      ["POST", "/v1/shares"],
    ]) {
      const response = await fetch(`${server.baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body:
          method === "GET"
            ? undefined
            : JSON.stringify({
                changes: [],
                cursors: {},
                password: "x",
                entityId: "e",
                recipient: "a@b.co",
                role: "viewer",
              }),
      });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("abuse", () => {
  it("rate limits sign in attempts", async () => {
    server = await startServer({ RATE_LIMIT_SCALE: "1" });
    await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await code(server.client().signIn("ada", "wrong password!", PHONE))) ?? 200);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("refuses a body over the size limit", async () => {
    server = await startServer({ MAX_BODY_BYTES: "4096" });
    const response = await fetch(`${server.baseUrl}/v1/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "ada", password: "x".repeat(10_000) }),
    });
    expect(response.status).toBe(413);
  });

  it("validates every field of a change", async () => {
    server = await startServer();
    const { api } = await verifiedAccount(server, "ada@example.com");
    const bad = [
      {
        dataset: "theirs",
        table: "spaces",
        pk: "s",
        scope: null,
        fields: {},
        clocks: {},
        baseClocks: {},
        deletedClock: null,
      },
      {
        dataset: "own",
        table: "spaces",
        pk: "s",
        scope: null,
        fields: { id: { nested: true } },
        clocks: {},
        baseClocks: {},
        deletedClock: null,
      },
      {
        dataset: "own",
        table: "spaces",
        pk: "s",
        scope: null,
        fields: { id: "s" },
        clocks: { id: "yesterday" },
        baseClocks: {},
        deletedClock: null,
      },
    ];
    for (const change of bad) {
      const response = await fetch(`${server.baseUrl}/v1/sync/push`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await accessToken(api)}`,
        },
        body: JSON.stringify({ changes: [change] }),
      });
      expect(response.status).toBe(422);
    }
  });
});

/// The access token a client holds, read through a request it signs.
async function accessToken(api: ApiClient): Promise<string> {
  let token = "";
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const header = new Headers(init?.headers).get("authorization");
      if (header) token = header.slice(7);
      return original(input, init);
    },
    { preconnect: original.preconnect },
  );
  try {
    await api.sessions();
  } finally {
    globalThis.fetch = original;
  }
  return token;
}

describe("browsers", () => {
  it("only lets the desktop app's origins in", async () => {
    server = await startServer();
    const allowed = await fetch(`${server.baseUrl}/health`, {
      headers: { origin: "tauri://localhost" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
    const other = await fetch(`${server.baseUrl}/health`, {
      headers: { origin: "https://evil.example" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("logs", () => {
  it("never hold a password or a token", async () => {
    server = await startServer({ LOG_LEVEL: "debug" });
    const tokens = new MemoryTokens();
    const api = server.client(tokens);
    await api.signUp({ username: "ada", email: "ada@example.com", password: PASSWORD }, DESKTOP);
    const verify = server.mailer.link("ada@example.com", "/v1/auth/verify-email") ?? "";
    await fetch(verify.replace("http://nookly.test", server.baseUrl));
    await api.sessions();
    await server
      .client()
      .signIn("ada", "wrong password!", PHONE)
      .catch(() => {});
    const secrets = [
      PASSWORD,
      "wrong password!",
      tokens.token ?? "",
      new URL(verify).searchParams.get("token") ?? "",
    ];
    const logs = server.logs.join("\n");
    expect(logs).toContain('"path":"/v1/auth/verify-email"');
    for (const secret of secrets) expect(logs).not.toContain(secret);
  });
});
