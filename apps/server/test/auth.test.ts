import { ApiRequestError } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DESKTOP,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  startServer,
  verifiedAccount,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.stop();
});

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof ApiRequestError) return error.status;
    throw error;
  }
}

describe("accounts", () => {
  it("signs up, then confirms the email with the emailed link", async () => {
    const api = server.client();
    const user = await api.register("Ada@Example.com", PASSWORD, DESKTOP);
    expect(user.email).toBe("ada@example.com");
    expect(user.emailVerified).toBe(false);
    const link = server.mailer.link("ada@example.com", "/verify-email");
    expect(link).toStartWith("http://nookly.test/verify-email?token=");
    const page = await fetch(`${server.baseUrl}/verify-email${new URL(link ?? "").search}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Email confirmed");
    expect((await api.me()).emailVerified).toBe(true);
    // A link works once.
    expect(
      (await fetch(`${server.baseUrl}/verify-email${new URL(link ?? "").search}`)).status,
    ).toBe(400);
  });

  it("refuses a second account for the same email", async () => {
    await server.client().register("ada@example.com", PASSWORD, DESKTOP);
    expect(await status(server.client().register("ada@example.com", PASSWORD, DESKTOP))).toBe(409);
  });

  it("refuses a short password", async () => {
    const response = await fetch(`${server.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "short", device: DESKTOP }),
    });
    expect(response.status).toBe(422);
  });

  it("signs in with the right password only", async () => {
    await server.client().register("ada@example.com", PASSWORD, DESKTOP);
    expect(await status(server.client().signIn("ada@example.com", "wrong password!", PHONE))).toBe(
      401,
    );
    expect(await status(server.client().signIn("nobody@example.com", PASSWORD, PHONE))).toBe(401);
    const user = await server.client().signIn("ada@example.com", PASSWORD, PHONE);
    expect(user.email).toBe("ada@example.com");
  });

  it("stores passwords with argon2id, never as typed", async () => {
    await server.client().register("ada@example.com", PASSWORD, DESKTOP);
    const [row] = await server.sql`SELECT password_hash FROM users`;
    expect(row.password_hash).toStartWith("$argon2id$");
    expect(row.password_hash).not.toContain(PASSWORD);
  });
});

describe("tokens", () => {
  it("rotates the refresh token on every use", async () => {
    const tokens = new MemoryTokens();
    const api = server.client(tokens);
    await api.register("ada@example.com", PASSWORD, DESKTOP);
    const first = tokens.token;
    const response = await fetch(`${server.baseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: first }),
    });
    const next = await response.json();
    expect(next.refreshToken).not.toBe(first);
    expect(next.accessToken).toBeString();
  });

  it("revokes the session when a used refresh token comes back", async () => {
    const tokens = new MemoryTokens();
    await server.client(tokens).register("ada@example.com", PASSWORD, DESKTOP);
    const stolen = tokens.token;
    const refresh = (token: string | null) =>
      fetch(`${server.baseUrl}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
    const legit = await (await refresh(stolen)).json();
    expect((await refresh(stolen)).status).toBe(401);
    // The rotated token died with the session.
    expect((await refresh(legit.refreshToken)).status).toBe(401);
  });

  it("refuses a forged or garbled access token", async () => {
    for (const token of ["nonsense", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."]) {
      const response = await fetch(`${server.baseUrl}/v1/account`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(401);
    }
  });
});

describe("sessions", () => {
  it("lists each device and signs one out", async () => {
    const desktop = server.client();
    await desktop.register("ada@example.com", PASSWORD, DESKTOP);
    const phoneTokens = new MemoryTokens();
    const phone = server.client(phoneTokens);
    await phone.signIn("ada@example.com", PASSWORD, PHONE);
    const sessions = await desktop.sessions();
    expect(sessions.map((s) => [s.deviceName, s.current])).toEqual([
      ["iPhone", false],
      ["MacBook", true],
    ]);
    await desktop.revokeSession(sessions[0].id);
    expect(await status(phone.me())).toBe(401);
    expect(phoneTokens.token).toBeNull();
    expect((await desktop.sessions()).map((s) => s.deviceName)).toEqual(["MacBook"]);
  });

  it("signs out this device", async () => {
    const api = server.client();
    await api.register("ada@example.com", PASSWORD, DESKTOP);
    await api.signOut();
    expect(await api.isSignedIn()).toBe(false);
  });
});

describe("password reset", () => {
  it("sets a new password from the emailed link and signs every device out", async () => {
    const desktop = server.client();
    await desktop.register("ada@example.com", PASSWORD, DESKTOP);
    await server.client().forgotPassword("ada@example.com");
    // Unknown addresses look the same.
    await server.client().forgotPassword("nobody@example.com");
    const link = server.mailer.link("ada@example.com", "/reset-password");
    const token = new URL(link ?? "").searchParams.get("token") ?? "";
    const form = await fetch(`${server.baseUrl}/reset-password?token=${token}`);
    expect(await form.text()).toContain("Choose a new password");
    await server.client().resetPassword(token, "a brand new password");
    expect(await status(desktop.me())).toBe(401);
    expect(await status(server.client().signIn("ada@example.com", PASSWORD, PHONE))).toBe(401);
    await server.client().signIn("ada@example.com", "a brand new password", PHONE);
    expect(await status(server.client().resetPassword(token, "another new password"))).toBe(400);
  });
});

describe("deleting an account", () => {
  it("needs the password, then removes everything the server holds for it", async () => {
    const { api } = await verifiedAccount(server, "ada@example.com");
    await api.push({
      changes: [
        {
          dataset: "own",
          table: "task_statuses",
          pk: "todo",
          scope: null,
          fields: { id: "todo", name: "To do" },
          clocks: { id: "1791934383689-000001-dev", name: "1791934383689-000001-dev" },
          baseClocks: {},
          deletedClock: null,
        },
      ],
    });
    expect(await status(api.deleteAccount("wrong password!"))).toBe(401);
    await api.deleteAccount(PASSWORD);
    for (const table of ["users", "sessions", "refresh_tokens", "email_tokens", "records"]) {
      const [row] = await server.sql`SELECT COUNT(*)::int AS n FROM ${server.sql(table)}`;
      expect(row.n, table).toBe(0);
    }
  });
});
