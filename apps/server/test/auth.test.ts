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
  HOOK_TIMEOUT,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
}, HOOK_TIMEOUT);
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

async function failure(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
    return { status: 200, code: "ok" };
  } catch (error) {
    if (error instanceof ApiRequestError) return { status: error.status, code: error.code };
    throw error;
  }
}
const status = async (promise: Promise<unknown>) => (await failure(promise)).status;

describe("accounts", () => {
  it("signs up with a username and a password, no email needed", async () => {
    const api = server.client();
    const user = await api.signUp({ username: "Ada", password: PASSWORD }, DESKTOP);
    expect(user.username).toBe("ada");
    expect(user.email).toBeNull();
    expect((await api.me()).username).toBe("ada");
    // Nothing is mailed to an account without an address.
    expect(server.mailer.sent).toHaveLength(0);
  });

  it("signs up with an email too, and confirms it with the emailed link", async () => {
    const api = server.client();
    const user = await api.signUp(
      { username: "ada", email: "Ada@Example.com", password: PASSWORD },
      DESKTOP,
    );
    expect(user.email).toBe("ada@example.com");
    expect(user.emailVerified).toBe(false);
    const link = server.mailer.link("ada@example.com", "/v1/auth/verify-email");
    expect(link).toStartWith("http://nookly.test/v1/auth/verify-email?token=");
    const page = await fetch(link?.replace("http://nookly.test", server.baseUrl) ?? "", {
      redirect: "follow",
    });
    expect(await page.text()).toContain("Email confirmed");
    expect((await api.me()).emailVerified).toBe(true);
  });

  it("refuses a username that is taken, whatever its case", async () => {
    await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const taken = await failure(
      server.client().signUp({ username: "ADA", password: PASSWORD }, DESKTOP),
    );
    expect(taken.code).toBe("username_is_already_taken");
  });

  it("refuses an email that another account uses", async () => {
    await server
      .client()
      .signUp({ username: "ada", email: "ada@example.com", password: PASSWORD }, DESKTOP);
    const taken = await failure(
      server
        .client()
        .signUp({ username: "ben", email: "ada@example.com", password: PASSWORD }, DESKTOP),
    );
    expect(taken.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses a short password", async () => {
    const short = await failure(
      server.client().signUp({ username: "ada", password: "short" }, DESKTOP),
    );
    expect(short.code).toBe("password_too_short");
  });

  it("signs in with the username or the email, and the right password only", async () => {
    await server
      .client()
      .signUp({ username: "ada", email: "ada@example.com", password: PASSWORD }, DESKTOP);
    expect(await status(server.client().signIn("ada", "wrong password!", PHONE))).toBe(401);
    expect(await status(server.client().signIn("nobody", PASSWORD, PHONE))).toBe(401);
    expect((await server.client().signIn("Ada", PASSWORD, PHONE)).username).toBe("ada");
    expect((await server.client().signIn("ADA@example.com", PASSWORD, PHONE)).username).toBe("ada");
  });

  it("stores passwords with argon2id, never as typed", async () => {
    await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const [row] = await server.sql`SELECT password FROM auth_account`;
    expect(row.password).toStartWith("$argon2id$");
    expect(row.password).not.toContain(PASSWORD);
  });

  it("keeps a profile row for sync next to every account", async () => {
    const user = await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const [row] = await server.sql`SELECT id FROM users WHERE id = ${user.id}`;
    expect(row?.id).toBe(user.id);
  });

  it("lists the sign in providers, none until one is configured", async () => {
    expect(await server.client().providers()).toEqual([]);
    const withGoogle = await startServer({
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "secret",
    });
    try {
      expect(await withGoogle.client().providers()).toEqual(["google"]);
    } finally {
      await withGoogle.stop();
    }
  });
});

describe("sessions", () => {
  it("stays signed in: a restarted client with the stored token is still in", async () => {
    const tokens = new MemoryTokens();
    await server.client(tokens).signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    expect(tokens.token).toBeString();
    const restarted = server.client(tokens);
    expect(await restarted.isSignedIn()).toBe(true);
    expect((await restarted.me()).username).toBe("ada");
  });

  it("refuses a forged or garbled token, and forgets it", async () => {
    for (const token of ["nonsense", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."]) {
      const response = await fetch(`${server.baseUrl}/v1/account`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(401);
    }
    const tokens = new MemoryTokens();
    tokens.token = "nonsense";
    let signedOut = false;
    const api = server.client(tokens, () => (signedOut = true));
    expect(await status(api.me())).toBe(401);
    expect(tokens.token).toBeNull();
    expect(signedOut).toBe(true);
  });

  it("lists each device by name and signs one out", async () => {
    const desktop = server.client();
    await desktop.signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const phoneTokens = new MemoryTokens();
    const phone = server.client(phoneTokens);
    await phone.signIn("ada", PASSWORD, PHONE);
    const sessions = await desktop.sessions();
    expect(sessions.map((s) => [s.deviceName, s.platform, s.current])).toEqual([
      ["iPhone", "ios", false],
      ["MacBook", "macos", true],
    ]);
    await desktop.revokeSession(sessions[0].id);
    expect(await status(phone.me())).toBe(401);
    expect(phoneTokens.token).toBeNull();
    expect((await desktop.sessions()).map((s) => s.deviceName)).toEqual(["MacBook"]);
  });

  it("signs out this device", async () => {
    const tokens = new MemoryTokens();
    const api = server.client(tokens);
    await api.signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    const token = tokens.token;
    await api.signOut();
    expect(await api.isSignedIn()).toBe(false);
    const reused = await fetch(`${server.baseUrl}/v1/account`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reused.status).toBe(401);
  });
});

describe("passwords", () => {
  it("sets a new password from the emailed link and signs every device out", async () => {
    const desktop = server.client();
    await desktop.signUp(
      { username: "ada", email: "ada@example.com", password: PASSWORD },
      DESKTOP,
    );
    await server.client().forgotPassword("ada@example.com");
    // Unknown addresses look the same.
    await server.client().forgotPassword("nobody@example.com");
    const link = server.mailer.link("ada@example.com", "/reset-password");
    const token = new URL(link ?? "").searchParams.get("token") ?? "";
    expect(token).not.toBe("");
    const form = await fetch(`${server.baseUrl}/reset-password?token=${token}`);
    expect(await form.text()).toContain("Choose a new password");
    await server.client().resetPassword(token, "a brand new password");
    expect(await status(desktop.me())).toBe(401);
    expect(await status(server.client().signIn("ada", PASSWORD, PHONE))).toBe(401);
    await server.client().signIn("ada", "a brand new password", PHONE);
    expect(await status(server.client().resetPassword(token, "another new password"))).toBe(400);
  });

  it("changes the password when the current one is right", async () => {
    const api = server.client();
    await api.signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    expect(await status(api.changePassword("wrong password!", "a brand new password"))).toBe(400);
    await api.changePassword(PASSWORD, "a brand new password");
    await server.client().signIn("ada", "a brand new password", PHONE);
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
    expect(await status(api.deleteAccount("wrong password!"))).toBe(403);
    // A wrong password isn't a sign out.
    expect(await api.isSignedIn()).toBe(true);
    await api.deleteAccount(PASSWORD);
    for (const table of ["auth_user", "auth_session", "auth_account", "users", "records"]) {
      const [row] = await server.sql`SELECT COUNT(*)::int AS n FROM ${server.sql(table)}`;
      expect(row.n, table).toBe(0);
    }
  });
});
