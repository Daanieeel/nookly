import { ApiClient, ApiRequestError } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DESKTOP,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  account,
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

  it("signs up and in from an app whose networking layer attaches stale cookies", async () => {
    // A phone's networking layer keeps the cookie of an earlier sign in and sends it
    // along, without an Origin; the apps use bearer tokens, so it must not matter.
    const fetch = (url: string, init: RequestInit) =>
      globalThis.fetch(url, {
        ...init,
        headers: { ...Object.fromEntries(new Headers(init.headers)), cookie: "stale=1" },
      });
    const appClient = () =>
      new ApiClient({ baseUrl: server.baseUrl, tokens: new MemoryTokens(), fetch });
    const user = await appClient().signUp({ username: "grace", password: PASSWORD }, PHONE);
    expect(user.username).toBe("grace");
    expect((await appClient().signIn("grace", PASSWORD, PHONE)).username).toBe("grace");
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
    const html = await page.text();
    expect(html).toContain("Email confirmed");
    expect(html).toContain('class="brand"');
    for (const path of ["imprint", "privacy", "terms"]) {
      expect(html).toContain(`href="https://nookly.work/${path}"`);
    }
    expect((await api.me()).emailVerified).toBe(true);
  });

  it("sends emails dressed like Nookly, always in light mode, with a plain text twin", async () => {
    await server
      .client()
      .signUp({ username: "ada", email: "ada@example.com", password: PASSWORD }, DESKTOP);
    const mail = server.mailer.sent.find((m) => m.to === "ada@example.com");
    expect(mail?.text).toContain("/v1/auth/verify-email");
    expect(mail?.html).toContain('content="only light"');
    expect(mail?.html).toContain("Confirm email");
    expect(mail?.html).toContain("http://nookly.test/logo.png");
    expect(mail?.html).toContain("/v1/auth/verify-email");
    expect(mail?.html).not.toContain("prefers-color-scheme");
    expect(mail?.html).toContain('href="https://nookly.work/privacy"');
  });

  it("colours the icon of a success page green and an error page red", async () => {
    const { emailConfirmedPage, passwordChangedPage, resultPage } = await import("../src/pages.ts");
    for (const html of [emailConfirmedPage(), passwordChangedPage()]) {
      expect(html).toContain('class="card success"');
      expect(html).toContain(".success .badge b{color:var(--green)}");
    }
    expect(resultPage("x", "y", "error")).toContain(".error .badge b{color:var(--red)}");
  });

  it("serves the logo the pages and emails show", async () => {
    const logo = await fetch(`${server.baseUrl}/logo.png`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/png");
    expect((await logo.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("shows a friendly page for a confirm link that no longer works", async () => {
    const page = await fetch(`${server.baseUrl}/verified?error=INVALID_TOKEN`);
    expect(page.status).toBe(400);
    expect(await page.text()).toContain("This link doesn't work");
  });

  it("keeps the terms an account agreed to, none until it does", async () => {
    const api = server.client();
    const user = await api.signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    expect(user.termsVersion).toBeNull();
    const accepted = await api.acceptTerms("2026-11-22");
    expect(accepted.termsVersion).toBe("2026-11-22");
    expect((await api.me()).termsVersion).toBe("2026-11-22");
    // A later version replaces it.
    expect((await api.acceptTerms("2027-02-01")).termsVersion).toBe("2027-02-01");
  });

  it("records the terms at sign up, when the app says they were agreed to", async () => {
    const api = server.client();
    const user = await api.signUp(
      { username: "ada", password: PASSWORD, termsVersion: "2026-11-22" },
      DESKTOP,
    );
    expect(user.termsVersion).toBe("2026-11-22");
  });

  it("refuses an empty or absurd terms version, and a signed out one", async () => {
    const api = server.client();
    await api.signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    expect(await status(api.acceptTerms(""))).toBe(422);
    expect(await status(api.acceptTerms("x".repeat(100)))).toBe(422);
    expect(await status(server.client().acceptTerms("2026-11-22"))).toBe(401);
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

  it("refuses a forged or garbled token, without calling any session over", async () => {
    for (const token of ["nonsense", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."]) {
      const response = await fetch(`${server.baseUrl}/v1/account`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(403);
    }
    const tokens = new MemoryTokens();
    tokens.token = "nonsense";
    let signedOut = false;
    const api = server.client(tokens, () => (signedOut = true));
    expect(await status(api.me())).toBe(403);
    expect(tokens.token).toBe("nonsense");
    expect(signedOut).toBe(false);
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
    expect(reused.status).toBe(403);
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
    expect(await status(desktop.me())).toBe(403);
    expect(await status(server.client().signIn("ada", PASSWORD, PHONE))).toBe(401);
    await server.client().signIn("ada", "a brand new password", PHONE);
    expect(await status(server.client().resetPassword(token, "another new password"))).toBe(400);
  });

  it("shows a repeat field and a strength bar on the reset page, with a script that builds", async () => {
    const html = await (
      await fetch(`${server.baseUrl}/reset-password?token=${"t".repeat(12)}`)
    ).text();
    expect(html).toContain('name="confirm"');
    expect(html).toContain('aria-label="Repeat new password"');
    expect(html).toContain('role="meter"');
    expect(html).toContain('src="/reset-password.js"');
    const script = await fetch(`${server.baseUrl}/reset-password.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect((await script.text()).length).toBeGreaterThan(10_000);
  });

  it("refuses a reset when the two passwords differ, and keeps the old one", async () => {
    const api = server.client();
    await api.signUp({ username: "ada", email: "ada@example.com", password: PASSWORD }, DESKTOP);
    await server.client().forgotPassword("ada@example.com");
    const token =
      new URL(server.mailer.link("ada@example.com", "/reset-password") ?? "").searchParams.get(
        "token",
      ) ?? "";
    const form = (confirm: string) =>
      fetch(`${server.baseUrl}/reset-password`, {
        method: "POST",
        body: new URLSearchParams({ token, password: "a brand new password", confirm }),
      });
    const mismatch = await form("a different password");
    expect(mismatch.status).toBe(400);
    expect(await mismatch.text()).toContain("The passwords don't match.");
    await server.client().signIn("ada", PASSWORD, PHONE);
    const ok = await form("a brand new password");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Password changed");
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
  it("asks an account made with a provider to confirm with that provider instead of a password", async () => {
    const id = crypto.randomUUID();
    await server.sql`INSERT INTO auth_user (id, name, email, email_verified) VALUES (${id}, 'Notion Ada', 'notion-ada@example.com', true)`;
    await server.sql`INSERT INTO users (id, email) VALUES (${id}, 'notion-ada@example.com') ON CONFLICT DO NOTHING`;
    await server.sql`INSERT INTO auth_account (id, account_id, provider_id, user_id) VALUES (${crypto.randomUUID()}, ${"p-" + id}, 'notion', ${id})`;
    const token = `session-${id}`;
    await server.sql`INSERT INTO auth_session (id, user_id, token, expires_at) VALUES (${crypto.randomUUID()}, ${id}, ${token}, now() + interval '1 day')`;
    const tokens = new MemoryTokens();
    tokens.token = token;
    const api = server.client(tokens);
    // A typed phrase in the app is not enough: the server wants the provider to vouch for it.
    expect(await status(api.deleteAccount())).toBe(403);
    expect(await api.isSignedIn()).toBe(true);
    const [row] = await server.sql`SELECT COUNT(*)::int AS n FROM auth_user WHERE id = ${id}`;
    expect(row.n).toBe(1);
  });

  it("still asks an account with a password for it", async () => {
    const { api } = await account(server, "needspw", DESKTOP);
    expect(await status(api.deleteAccount())).toBe(403);
    expect(await api.isSignedIn()).toBe(true);
    await api.deleteAccount(PASSWORD);
  });
});
