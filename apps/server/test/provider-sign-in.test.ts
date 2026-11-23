import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  DESKTOP,
  HOOK_TIMEOUT,
  MemoryTokens,
  PHONE,
  type TestServer,
  startServer,
} from "./helpers.ts";

// Signing in with Google, GitHub or Notion from the apps: the app asks the server to begin,
// opens the browser at the provider, and gets back a one time code that only it can use,
// because only it holds the secret the server handed out when it began.
const BETA = "beta-key-for-tests";
let server: TestServer;

beforeAll(async () => {
  server = await startServer({
    GOOGLE_CLIENT_ID: "google-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "github-id",
    GITHUB_CLIENT_SECRET: "github-secret",
    BETA_KEY: BETA,
  });
}, HOOK_TIMEOUT);
afterAll(() => server.stop(), HOOK_TIMEOUT);

type Body = Record<string, string | number | boolean>;

async function post(path: string, body: Body, headers: Record<string, string> = {}) {
  return fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/// The ticket of the flow that was just begun: what the provider's callback carries back.
async function lastTicket(): Promise<string> {
  const rows = await server.sql<{ identifier: string }[]>`
    SELECT identifier FROM auth_verification WHERE identifier LIKE 'app-flow:%'
    ORDER BY created_at DESC LIMIT 1`;
  const identifier = rows[0]?.identifier;
  if (!identifier) throw new Error("no flow was begun");
  return identifier.slice("app-flow:".length);
}

/// What the browser holds after the provider signed someone in: the session cookie.
async function browserCookie(username: string): Promise<string> {
  const response = await post("/v1/auth/sign-up/email", {
    username,
    name: username,
    password: "correct horse battery",
    betaKey: BETA,
  });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  const session = cookies.find((cookie) => cookie.includes("session_token"));
  if (!session) throw new Error("no session cookie");
  return session;
}

describe("beginning", () => {
  it("sends the browser to the provider and hands the app a secret", async () => {
    const api = server.client();
    const { url, secret } = await api.beginProviderSignIn({ provider: "google" });
    const link = new URL(url);
    expect(link.origin).toBe("https://accounts.google.com");
    expect(link.searchParams.get("redirect_uri")).toBe(
      "http://nookly.test/v1/auth/callback/google",
    );
    expect(link.searchParams.get("client_id")).toBe("google-id.apps.googleusercontent.com");
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it("refuses a provider the server does not have", async () => {
    const response = await post("/v1/auth/app/begin", { provider: "notion" });
    expect(response.status).toBe(400);
  });

  it("shuts the raw provider route: only the apps' own begin starts a sign in", async () => {
    const response = await post("/v1/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/",
      requestSignUp: true,
    });
    expect(response.status).toBe(404);
  });

  it("makes a new account only with the beta key, like the password sign up", async () => {
    const api = server.client();
    await expect(
      api.beginProviderSignIn({ provider: "github", createAccount: true }),
    ).rejects.toThrow("Enter the beta key");
    await expect(
      api.beginProviderSignIn({ provider: "github", createAccount: true, betaKey: "wrong" }),
    ).rejects.toThrow("That beta key isn't right.");
    const begun = await api.beginProviderSignIn({
      provider: "github",
      createAccount: true,
      betaKey: BETA,
    });
    expect(new URL(begun.url).origin).toBe("https://github.com");
  });

  it("signing in to an account that exists needs no key", async () => {
    const api = server.client();
    const begun = await api.beginProviderSignIn({ provider: "github" });
    expect(begun.url).toContain("github.com");
  });
});

describe("coming back from the browser", () => {
  it("returns a code to the app, which swaps it for a signed in session", async () => {
    const cookie = await browserCookie("returning");
    const api = server.client(new MemoryTokens());
    const { secret } = await api.beginProviderSignIn({ provider: "google" });
    const ticket = await lastTicket();

    const done = await fetch(`${server.baseUrl}/oauth/done?t=${ticket}`, { headers: { cookie } });
    expect(done.status).toBe(200);
    const html = await done.text();
    expect(html).toContain(`nookly://auth?code=${ticket}`);
    // The browser keeps nothing: the session belongs to the app now.
    expect(done.headers.getSetCookie().join("\n")).toContain("Max-Age=0");

    const phone = server.client(new MemoryTokens());
    const user = await phone.finishProviderSignIn(ticket, secret, PHONE);
    expect(user.username).toBe("returning");
    const sessions = await phone.sessions();
    expect(sessions.some((s) => s.current && s.deviceName === "iPhone")).toBe(true);
  });

  it("goes back to a desktop through its own loopback port", async () => {
    const cookie = await browserCookie("desktopper");
    const api = server.client();
    await api.beginProviderSignIn({ provider: "google", port: 51423 });
    const ticket = await lastTicket();
    const done = await fetch(`${server.baseUrl}/oauth/done?t=${ticket}&p=51423`, {
      headers: { cookie },
    });
    expect(await done.text()).toContain(`http://127.0.0.1:51423/auth?code=${ticket}`);
  });

  it("will not go back to a privileged or garbled port", async () => {
    const cookie = await browserCookie("portless");
    const api = server.client();
    await api.beginProviderSignIn({ provider: "google" });
    const ticket = await lastTicket();
    for (const port of ["22", "99999", "abc", "80%2f@evil.example"]) {
      const done = await fetch(`${server.baseUrl}/oauth/done?t=${ticket}&p=${port}`, {
        headers: { cookie },
      });
      expect(done.status).toBe(400);
      expect(await done.text()).not.toContain("code=");
    }
  });

  it("is useless without the secret, and works once", async () => {
    const cookie = await browserCookie("once");
    const api = server.client();
    const { secret } = await api.beginProviderSignIn({ provider: "google" });
    const ticket = await lastTicket();
    await fetch(`${server.baseUrl}/oauth/done?t=${ticket}`, { headers: { cookie } });

    const stranger = server.client(new MemoryTokens());
    await expect(stranger.finishProviderSignIn(ticket, "x".repeat(43), DESKTOP)).rejects.toThrow();
    const owner = server.client(new MemoryTokens());
    await owner.finishProviderSignIn(ticket, secret, DESKTOP);
    await expect(
      server.client(new MemoryTokens()).finishProviderSignIn(ticket, secret, DESKTOP),
    ).rejects.toThrow();
  });

  it("gives nothing before the browser has signed in", async () => {
    const api = server.client();
    const { secret } = await api.beginProviderSignIn({ provider: "google" });
    const ticket = await lastTicket();
    await expect(
      server.client(new MemoryTokens()).finishProviderSignIn(ticket, secret, DESKTOP),
    ).rejects.toThrow();
  });

  it("shows a page and hands the app the reason when the provider said no", async () => {
    const api = server.client();
    await api.beginProviderSignIn({ provider: "google" });
    const ticket = await lastTicket();
    const done = await fetch(`${server.baseUrl}/oauth/done?t=${ticket}&error=signup_disabled`);
    const html = await done.text();
    expect(html).toContain("nookly://auth?error=signup_disabled");
    expect(html).not.toContain("code=");
    // The flow is over: the ticket opens nothing.
    await expect(
      server.client(new MemoryTokens()).finishProviderSignIn(ticket, "x".repeat(43), DESKTOP),
    ).rejects.toThrow();
  });

  it("answers a browser with no session, or an old ticket, with a page that says so", async () => {
    const api = server.client();
    await api.beginProviderSignIn({ provider: "google" });
    const ticket = await lastTicket();
    const bare = await fetch(`${server.baseUrl}/oauth/done?t=${ticket}`);
    expect(bare.status).toBe(400);
    expect(await bare.text()).not.toContain("code=");
    const unknown = await fetch(`${server.baseUrl}/oauth/done?t=${"a".repeat(43)}`);
    expect(unknown.status).toBe(400);
  });
});

describe("the username of an account made with a provider", () => {
  async function providerAccount(email: string, name: string) {
    const id = crypto.randomUUID();
    await server.sql`INSERT INTO auth_user (id, name, email, email_verified) VALUES (${id}, ${name}, ${email}, true)`;
    await server.sql`INSERT INTO users (id, email) VALUES (${id}, ${email}) ON CONFLICT DO NOTHING`;
    await server.sql`INSERT INTO auth_account (id, account_id, provider_id, user_id) VALUES (${crypto.randomUUID()}, ${"p-" + id}, 'github', ${id})`;
    const token = `session-${id}`;
    await server.sql`INSERT INTO auth_session (id, user_id, token, expires_at) VALUES (${crypto.randomUUID()}, ${id}, ${token}, now() + interval '1 day')`;
    const tokens = new MemoryTokens();
    tokens.token = token;
    return server.client(tokens);
  }

  it("is asked for once, then it is theirs", async () => {
    const api = await providerAccount("grace@example.com", "Grace Hopper");
    const before = await api.me();
    expect(before.needsUsername).toBe(true);
    const user = await api.setUsername("grace_h");
    expect(user.username).toBe("grace_h");
    expect(user.needsUsername).toBe(false);
    await expect(api.setUsername("another")).rejects.toThrow();
    expect((await api.me()).username).toBe("grace_h");
  });

  it("refuses a taken or malformed name", async () => {
    const first = await providerAccount("one@example.com", "One");
    await first.setUsername("taken_name");
    const second = await providerAccount("two@example.com", "Two");
    await expect(second.setUsername("Taken_Name")).rejects.toThrow("taken");
    for (const bad of ["ab", "has space", "x".repeat(31), "ünï"]) {
      await expect(second.setUsername(bad)).rejects.toThrow();
    }
    expect((await second.me()).needsUsername).toBe(true);
  });

  it("is never asked of an account that signed up with a username", async () => {
    const api = server.client();
    const user = await api.signUp(
      { username: "passworded", password: "correct horse battery", betaKey: BETA },
      DESKTOP,
    );
    expect(user.needsUsername).toBe(false);
    await expect(api.setUsername("changed_mind")).rejects.toThrow();
  });
});
