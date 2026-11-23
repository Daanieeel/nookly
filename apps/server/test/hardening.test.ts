import { afterEach, describe, expect, it } from "bun:test";
import {
  DESKTOP,
  HOOK_TIMEOUT,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  account,
  startServer,
  verifiedAccount,
} from "./helpers.ts";

/// Findings of the pre-release sync test (report/Nookly-Sync-Test-Report.pdf).

let server: TestServer;
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

const clock = (offsetMs = 0) => `${String(Date.now() + offsetMs).padStart(13, "0")}-000001-test`;

function spaceChange(pk: string, name: string, at = clock()) {
  return {
    dataset: "own",
    table: "spaces",
    pk,
    scope: null,
    fields: { id: pk, name, color: "blue", created_at: "2026-01-01", updated_at: "2026-01-01" },
    clocks: Object.fromEntries(
      ["id", "name", "color", "created_at", "updated_at"].map((f) => [f, at]),
    ),
    baseClocks: {},
    deletedClock: null,
  };
}

describe("values the database can't hold", () => {
  it("refuses a NUL byte per change and applies the others of the same push", async () => {
    server = await startServer();
    const { api } = await verifiedAccount(server, "ada@example.com");
    const response = await api.push({
      changes: [
        spaceChange("good-1", "First"),
        spaceChange("poison", "Bad\u0000value"),
        spaceChange("good-2", "Second"),
      ],
    });
    expect(response.results.map((r) => [r.pk, r.status, r.reason])).toEqual([
      ["good-1", "applied", undefined],
      ["poison", "rejected", "invalid-value"],
      ["good-2", "applied", undefined],
    ]);
    const rows = await server.sql`SELECT pk FROM records WHERE tbl = 'spaces' ORDER BY pk`;
    expect(rows.map((r) => r.pk)).toEqual(["good-1", "good-2"]);
  });

  it("refuses a NUL byte in a key and in a reported conflict", async () => {
    server = await startServer();
    const { api } = await verifiedAccount(server, "ada@example.com");
    const response = await api.push({ changes: [spaceChange("bad\u0000key", "x")] });
    expect(response.results[0]?.status).toBe("rejected");
    const status = await fetch(`${server.baseUrl}/v1/conflicts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await tokenFor("ada")}`,
      },
      body: JSON.stringify({
        table: "spaces",
        pk: "p",
        field: "name",
        losingValue: "a\u0000b",
        losingClock: clock(),
        winningClock: null,
      }),
    }).then((r) => r.status);
    expect(status).toBeLessThan(500);
  });

  it("keeps the rest of a push when committing one change fails for another reason", async () => {
    server = await startServer();
    const { api } = await verifiedAccount(server, "ada@example.com");
    const real = server.sync.commit.bind(server.sync);
    server.sync.commit = async (ownerId, items, authorId) => {
      if (items.length > 1 && items.some((i) => i.change.pk === "explodes"))
        throw new Error("database says no");
      if (items.length === 1 && items[0]?.change.pk === "explodes")
        throw new Error("database says no");
      return real(ownerId, items, authorId);
    };
    const response = await api.push({
      changes: [
        spaceChange("fine-1", "A"),
        spaceChange("explodes", "B"),
        spaceChange("fine-2", "C"),
      ],
    });
    expect(response.results.map((r) => [r.pk, r.status])).toEqual([
      ["fine-1", "applied"],
      ["explodes", "rejected"],
      ["fine-2", "applied"],
    ]);
  });
});

describe("clocks from the future", () => {
  it("refuses a clock far ahead of the server's, so it can't win every merge forever", async () => {
    server = await startServer();
    const { api } = await verifiedAccount(server, "ada@example.com");
    const response = await api.push({
      changes: [
        spaceChange("now", "Fine"),
        spaceChange("future", "Poison", "9999999999999-999999-evil"),
        spaceChange("a-bit-ahead", "Skewed by an hour", clock(60 * 60 * 1000)),
      ],
    });
    expect(response.results.map((r) => [r.pk, r.status, r.reason])).toEqual([
      ["now", "applied", undefined],
      ["future", "rejected", "clock-skew"],
      ["a-bit-ahead", "applied", undefined],
    ]);
  });
});

/// A session token for an account, from a sign in of its own.
async function tokenFor(username: string): Promise<string> {
  const tokens = new MemoryTokens();
  await server.client(tokens).signIn(username, PASSWORD, DESKTOP);
  return tokens.token ?? "";
}

describe("sign in limits", () => {
  it(
    "ignores addresses a client puts in X-Forwarded-For ahead of the proxy's own",
    async () => {
      server = await startServer({ RATE_LIMIT_SCALE: "0.3", TRUST_PROXY: "true" });
      await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) {
        const response = await fetch(`${server.baseUrl}/v1/auth/sign-in/username`, {
          method: "POST",
          // Fake address first, as a client sends; the proxy appended the real one last.
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.0.0.${i + 1}, 203.0.113.9`,
          },
          body: JSON.stringify({ username: "ada", password: "wrong password!" }),
        });
        statuses.push(response.status);
      }
      expect(statuses.at(-1)).toBe(429);
    },
    HOOK_TIMEOUT,
  );

  it(
    "limits attempts on one account however many addresses they come from",
    async () => {
      server = await startServer({ RATE_LIMIT_SCALE: "0.3", TRUST_PROXY: "true" });
      await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) {
        const response = await fetch(`${server.baseUrl}/v1/auth/sign-in/username`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${i + 1}` },
          body: JSON.stringify({ username: "Ada", password: "wrong password!" }),
        });
        statuses.push(response.status);
      }
      expect(statuses.at(-1)).toBe(429);
      // Someone else's account is not locked by it.
      const other = await fetch(`${server.baseUrl}/v1/auth/sign-in/username`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.200" },
        body: JSON.stringify({ username: "ben", password: "wrong password!" }),
      });
      expect(other.status).not.toBe(429);
    },
    HOOK_TIMEOUT,
  );
});

describe("the API reference", () => {
  it("is public in development and off in production", async () => {
    server = await startServer();
    expect((await fetch(`${server.baseUrl}/docs/json`)).status).toBe(200);
    await server.stop();
    server = await startServer({ API_DOCS: "false" });
    expect((await fetch(`${server.baseUrl}/docs`)).status).toBe(404);
    expect((await fetch(`${server.baseUrl}/docs/json`)).status).toBe(404);
  });
});

describe("big bodies", () => {
  it("answers 413 for a body over the limit", async () => {
    server = await startServer();
    await verifiedAccount(server, "ada@example.com", PHONE);
    const response = await fetch(`${server.baseUrl}/v1/sync/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await tokenFor("ada")}`,
      },
      body: JSON.stringify({ changes: [], pad: "x".repeat(9 * 1024 * 1024) }),
    });
    expect(response.status).toBe(413);
  });
});

describe("last active", () => {
  it("shows when a device was really last used, and keeps its session open", async () => {
    server = await startServer({ SESSION_TOUCH_SECONDS: "0" });
    const { api } = await account(server, "ada");
    // Better-auth only renews a session once a day; the list showed that, not the use.
    await server.sql`UPDATE auth_session SET updated_at = now() - interval '5 hours', expires_at = now() + interval '60 days'`;
    await api.me();
    const [session] = await api.sessions();
    expect(Date.now() - Date.parse(session?.lastUsedAt ?? "")).toBeLessThan(10_000);
  });

  it("writes it at most once a minute per device", async () => {
    server = await startServer();
    const { api } = await verifiedAccount(server, "ada@example.com");
    await api.me();
    const [first] = await server.sql`SELECT updated_at FROM auth_session`;
    await Bun.sleep(30);
    await api.me();
    const [second] = await server.sql`SELECT updated_at FROM auth_session`;
    expect(second?.updated_at).toEqual(first?.updated_at);
  });
});
