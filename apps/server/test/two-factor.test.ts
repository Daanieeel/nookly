import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { ApiClient, TwoFactorRequiredError } from "@nookly/shared/api";
import {
  DESKTOP,
  HOOK_TIMEOUT,
  MemoryTokens,
  PASSWORD,
  type TestServer,
  account,
  startServer,
  usernameOf,
  verifiedAccount,
} from "./helpers.ts";

// Two-factor for every account: emailed codes, an authenticator app and recovery codes.
let server: TestServer;
let required: TestServer;

beforeAll(async () => {
  server = await startServer();
}, HOOK_TIMEOUT);
afterAll(() => server.stop(), HOOK_TIMEOUT);

/// The code a mail to `to` carries: the six digits.
function emailedCode(s: TestServer, to: string): string {
  const mail = [...s.mailer.sent].reverse().find((m) => m.to === to && /\b\d{6}\b/.test(m.text));
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("no code was emailed");
  return code;
}

/// The code an authenticator app shows for the secret in a setup address.
async function appCode(uri: string): Promise<string> {
  const key = new URL(uri).searchParams.get("secret") ?? "";
  return createOTP(base32.decode(key)).totp();
}

/// Signs in and returns the challenge the server asks to be answered.
async function challengeFor(s: TestServer, identifier: string) {
  const api = s.client(new MemoryTokens());
  try {
    await api.signIn(identifier, PASSWORD, DESKTOP);
  } catch (error) {
    if (error instanceof TwoFactorRequiredError) return { api, challenge: error };
    throw error;
  }
  throw new Error("signed in without a second step");
}

describe("emailed codes", () => {
  it("are turned on for an account with a confirmed email, and ask for a code at sign in", async () => {
    const { api } = await verifiedAccount(server, "ada@example.com");
    expect((await api.security()).email).toMatchObject({ enabled: false, possible: true });
    const summary = await api.enableEmailTwoFactor();
    expect(summary).toMatchObject({ enabled: true, email: { enabled: true } });

    const { api: second, challenge } = await challengeFor(server, "ada");
    expect(challenge.methods).toEqual(["email"]);
    // No session yet: the account is not reachable with what the first step gave.
    expect(await second.isSignedIn()).toBe(false);

    await second.sendTwoFactorEmail(challenge.challenge);
    const code = emailedCode(server, "ada@example.com");
    const user = await second.verifyTwoFactor(challenge.challenge, "email", code, DESKTOP);
    expect(user.username).toBe("ada");
    expect((await second.sessions()).some((s) => s.current && s.deviceName === "MacBook")).toBe(
      true,
    );
  });

  it("finish from an app that sends a null Origin and a stale cookie, as a phone does", async () => {
    const { api: owner } = await verifiedAccount(server, "phone@example.com");
    await owner.enableEmailTwoFactor();
    // Some phone networking layers send the text "null" as the Origin, or an empty one.
    for (const origin of ["null", ""]) {
      const { api, challenge } = await challengeFor(server, "phone");
      await api.sendTwoFactorEmail(challenge.challenge);
      const code = emailedCode(server, "phone@example.com");
      const fetch = (url: string, init: RequestInit) =>
        globalThis.fetch(url, {
          ...init,
          headers: { ...Object.fromEntries(new Headers(init.headers)), origin, cookie: "stale=1" },
        });
      const app = new ApiClient({ baseUrl: server.baseUrl, tokens: new MemoryTokens(), fetch });
      const user = await app.verifyTwoFactor(challenge.challenge, "email", code, DESKTOP);
      expect(user.username).toBe("phone");
    }
  });

  it("answer the same code sent twice at once with one sign in, as a paste on a phone does", async () => {
    const { api: owner } = await verifiedAccount(server, "twice@example.com");
    await owner.enableEmailTwoFactor();
    const { api, challenge } = await challengeFor(server, "twice");
    await api.sendTwoFactorEmail(challenge.challenge);
    const code = emailedCode(server, "twice@example.com");
    const [first, second] = await Promise.all([
      api.verifyTwoFactor(challenge.challenge, "email", code, DESKTOP),
      api.verifyTwoFactor(challenge.challenge, "email", code, DESKTOP),
    ]);
    expect(first.username).toBe("twice");
    expect(second.username).toBe("twice");
  });

  it("answer an app code sent twice at once with one sign in too", async () => {
    const { api: owner } = await verifiedAccount(server, "twiceapp@example.com");
    const start = await owner.startAuthenticator();
    await owner.confirmAuthenticator(await appCode(start.uri));
    const { api, challenge } = await challengeFor(server, "twiceapp");
    const code = await appCode(start.uri);
    const [first, second] = await Promise.all([
      api.verifyTwoFactor(challenge.challenge, "totp", code, DESKTOP),
      api.verifyTwoFactor(challenge.challenge, "totp", code, DESKTOP),
    ]);
    expect(first.username).toBe("twiceapp");
    expect(second.username).toBe("twiceapp");
  });

  it("refuse a wrong code, and a challenge works once", async () => {
    const { challenge, api } = await challengeFor(server, "ada");
    await api.sendTwoFactorEmail(challenge.challenge);
    await expect(
      api.verifyTwoFactor(challenge.challenge, "email", "000000", DESKTOP),
    ).rejects.toThrow();
    const code = emailedCode(server, "ada@example.com");
    await api.verifyTwoFactor(challenge.challenge, "email", code, DESKTOP);
    await expect(
      server
        .client(new MemoryTokens())
        .verifyTwoFactor(challenge.challenge, "email", code, DESKTOP),
    ).rejects.toThrow();
  });

  it("need a recent confirmation, and a challenge that is not one opens nothing", async () => {
    const { api } = await verifiedAccount(server, "grace@example.com");
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour'
      WHERE user_id = (SELECT id FROM auth_user WHERE username = 'grace')`;
    await expect(api.enableEmailTwoFactor()).rejects.toThrow(/confirm it's you/i);
    await expect(api.recheck({ password: "not the password" })).rejects.toThrow(/wrong/i);
    const stranger = server.client(new MemoryTokens());
    await expect(stranger.sendTwoFactorEmail("made-up")).rejects.toThrow();
    await expect(stranger.verifyTwoFactor("made-up", "email", "123456", DESKTOP)).rejects.toThrow();
  });

  it("are not offered to an account whose email is not confirmed, or that has none", async () => {
    const none = await account(server, "noemail");
    await expect(none.api.enableEmailTwoFactor()).rejects.toThrow(/confirmed email/);
    const unconfirmed = server.client();
    await unconfirmed.signUp(
      { username: "later", email: "later@example.com", password: PASSWORD },
      DESKTOP,
    );
    await expect(unconfirmed.enableEmailTwoFactor()).rejects.toThrow(/confirmed email/);
  });

  it("can be added to an account made without an email, once the address is confirmed", async () => {
    const { api } = await account(server, "plain");
    const user = await api.addEmail("plain@example.com");
    expect(user).toMatchObject({ email: "plain@example.com", emailVerified: false });
    const link = server.mailer.link("plain@example.com", "/v1/auth/verify-email");
    expect(link).toBeString();
    await fetch((link ?? "").replace("http://nookly.test", server.baseUrl));
    expect((await api.me()).emailVerified).toBe(true);
    expect((await api.enableEmailTwoFactor()).enabled).toBe(true);
    // An account that has an email cannot swap it here, and another account's address is taken.
    await expect(api.addEmail("other@example.com")).rejects.toThrow();
    const second = await account(server, "plain2");
    await expect(second.api.addEmail("plain@example.com")).rejects.toThrow();
  });
});

describe("an authenticator app", () => {
  it("is added with a setup address, switched on by a code from the app, and asked for at sign in", async () => {
    const { api } = await account(server, "totp1");
    const start = await api.startAuthenticator();
    expect(start.uri).toStartWith("otpauth://totp/Nookly:");
    expect(start.uri).toContain("issuer=Nookly");
    expect(start.key.length).toBeGreaterThanOrEqual(16);
    // Not on until a code from the app proves it works.
    expect((await api.security()).authenticator.enabled).toBe(false);
    await expect(api.confirmAuthenticator("000000")).rejects.toThrow();
    const codes = await api.confirmAuthenticator(await appCode(start.uri));
    expect(codes).toHaveLength(10);
    expect(codes[0]).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
    expect(await api.security()).toMatchObject({
      enabled: true,
      authenticator: { enabled: true },
      backupCodesLeft: 10,
    });

    const { api: second, challenge } = await challengeFor(server, "totp1");
    expect(challenge.methods).toEqual(["totp", "backup"]);
    const user = await second.verifyTwoFactor(
      challenge.challenge,
      "totp",
      await appCode(start.uri),
      DESKTOP,
    );
    expect(user.username).toBe("totp1");
  });

  it("refuses a wrong code, and stops answering after too many", async () => {
    const { api } = await account(server, "totp2");
    const start = await api.startAuthenticator();
    await api.confirmAuthenticator(await appCode(start.uri));
    const { api: second, challenge } = await challengeFor(server, "totp2");
    for (let i = 0; i < 5; i++) {
      await expect(
        second.verifyTwoFactor(challenge.challenge, "totp", "000000", DESKTOP),
      ).rejects.toThrow();
    }
    // The challenge is spent: even the right code no longer works, a new sign in is needed.
    await expect(
      second.verifyTwoFactor(challenge.challenge, "totp", await appCode(start.uri), DESKTOP),
    ).rejects.toThrow();
  });

  it("gives recovery codes that each work once", async () => {
    const { api } = await account(server, "totp3");
    const start = await api.startAuthenticator();
    const codes = await api.confirmAuthenticator(await appCode(start.uri));
    const first = await challengeFor(server, "totp3");
    await first.api.verifyTwoFactor(first.challenge.challenge, "backup", codes[0] ?? "", DESKTOP);
    const again = await challengeFor(server, "totp3");
    await expect(
      again.api.verifyTwoFactor(again.challenge.challenge, "backup", codes[0] ?? "", DESKTOP),
    ).rejects.toThrow();
    expect((await api.security()).backupCodesLeft).toBe(9);
  });

  it("replaces the recovery codes on request", async () => {
    const { api } = await account(server, "totp4");
    const start = await api.startAuthenticator();
    const old = await api.confirmAuthenticator(await appCode(start.uri));
    const fresh = await api.newBackupCodes();
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toEqual(old);
    const next = await challengeFor(server, "totp4");
    await expect(
      next.api.verifyTwoFactor(next.challenge.challenge, "backup", old[0] ?? "", DESKTOP),
    ).rejects.toThrow();
  });

  it("cannot be added twice, and a second start replaces one that was never confirmed", async () => {
    const { api } = await account(server, "totp5");
    const one = await api.startAuthenticator();
    const two = await api.startAuthenticator();
    expect(two.key).not.toBe(one.key);
    await api.confirmAuthenticator(await appCode(two.uri));
    await expect(api.startAuthenticator()).rejects.toThrow();
  });
});

describe("recovery codes without an authenticator app", () => {
  it("are made for an account with emailed codes, and each opens it once", async () => {
    const { api } = await verifiedAccount(server, "rec1@example.com");
    // Nothing to recover with while no method is on.
    await expect(api.newBackupCodes()).rejects.toThrow();
    await api.enableEmailTwoFactor();
    expect((await api.security()).backupCodesLeft).toBe(0);
    const codes = await api.newBackupCodes();
    expect(codes).toHaveLength(10);
    expect(await api.security()).toMatchObject({
      enabled: true,
      authenticator: { enabled: false },
      backupCodesLeft: 10,
    });

    const first = await challengeFor(server, "rec1");
    expect(first.challenge.methods).toEqual(["email", "backup"]);
    const user = await first.api.verifyTwoFactor(
      first.challenge.challenge,
      "backup",
      codes[0] ?? "",
      DESKTOP,
    );
    expect(user.username).toBe("rec1");
    const again = await challengeFor(server, "rec1");
    await expect(
      again.api.verifyTwoFactor(again.challenge.challenge, "backup", codes[0] ?? "", DESKTOP),
    ).rejects.toThrow();
    expect((await api.security()).backupCodesLeft).toBe(9);
  });

  it("are kept when an authenticator app is added or removed later", async () => {
    const { api } = await verifiedAccount(server, "rec2@example.com");
    await api.enableEmailTwoFactor();
    const codes = await api.newBackupCodes();
    const start = await api.startAuthenticator();
    // The codes already given stay good: the app does not hand out others.
    expect(await api.confirmAuthenticator(await appCode(start.uri))).toEqual([]);
    expect((await api.security()).backupCodesLeft).toBe(10);
    await api.disableTwoFactor("totp");
    expect(await api.security()).toMatchObject({
      authenticator: { enabled: false },
      backupCodesLeft: 10,
    });
    const next = await challengeFor(server, "rec2");
    expect(next.challenge.methods).toEqual(["email", "backup"]);
    await next.api.verifyTwoFactor(next.challenge.challenge, "backup", codes[0] ?? "", DESKTOP);
  });

  it("go with the last method", async () => {
    const { api } = await verifiedAccount(server, "rec3@example.com");
    await api.enableEmailTwoFactor();
    await api.newBackupCodes();
    await api.disableTwoFactor("email");
    expect(await api.security()).toMatchObject({ enabled: false, backupCodesLeft: 0 });
  });
});

describe("both together, and turning them off", () => {
  it("offers both at sign in, and a recovery code opens a locked out account", async () => {
    const { api } = await verifiedAccount(server, "both@example.com");
    await api.enableEmailTwoFactor();
    const start = await api.startAuthenticator();
    await api.confirmAuthenticator(await appCode(start.uri));
    const { challenge } = await challengeFor(server, "both");
    expect(challenge.methods).toEqual(["totp", "email", "backup"]);
  });

  it("turns a method off, and two-factor with the last one", async () => {
    const { api } = await verifiedAccount(server, "off@example.com");
    await api.enableEmailTwoFactor();
    const start = await api.startAuthenticator();
    await api.confirmAuthenticator(await appCode(start.uri));
    expect((await api.disableTwoFactor("totp")).authenticator.enabled).toBe(false);
    expect((await api.security()).enabled).toBe(true);
    expect((await api.disableTwoFactor("email")).enabled).toBe(false);
    // Signing in no longer asks for anything.
    const plain = server.client(new MemoryTokens());
    expect((await plain.signIn("off", PASSWORD, DESKTOP)).username).toBe("off");
  });
});

/// An account that only signs in with a provider, signed in.
async function providerAccount(s: TestServer, username: string, provider: string) {
  const id = crypto.randomUUID();
  const email = `${username}@example.com`;
  await s.sql`INSERT INTO auth_user (id, name, username, email, email_verified, primary_provider)
    VALUES (${id}, ${username}, ${username}, ${email}, true, ${provider})`;
  await s.sql`INSERT INTO users (id, email) VALUES (${id}, ${email}) ON CONFLICT DO NOTHING`;
  await s.sql`INSERT INTO auth_account (id, account_id, provider_id, user_id, email, email_verified)
    VALUES (${crypto.randomUUID()}, ${"p-" + id}, ${provider}, ${id}, ${email}, true)`;
  const token = `session-${id}`;
  await s.sql`INSERT INTO auth_session (id, user_id, token, expires_at, provider)
    VALUES (${crypto.randomUUID()}, ${id}, ${token}, now() + interval '1 day', ${provider})`;
  const tokens = new MemoryTokens();
  tokens.token = token;
  return s.client(tokens);
}

describe("accounts that sign in with another provider", () => {
  it("set two-factor up like any account", async () => {
    const api = await providerAccount(server, "prov", "github");
    expect((await api.security()).available).toBe(true);
    expect((await api.enableEmailTwoFactor()).enabled).toBe(true);
    const start = await api.startAuthenticator();
    const codes = await api.confirmAuthenticator(await appCode(start.uri));
    expect(codes).toHaveLength(10);
  });
});

describe("the way in", () => {
  it("shuts better-auth's own setup routes, which would swap the session under the app", async () => {
    for (const path of ["enable", "disable", "get-totp-uri", "generate-backup-codes"]) {
      const response = await fetch(`${server.baseUrl}/v1/auth/two-factor/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(404);
    }
  });

  it("keeps the half finished sign in off any cookie", async () => {
    await verifiedAccount(server, "nocookie@example.com").then(({ api }) =>
      api.enableEmailTwoFactor(),
    );
    const response = await fetch(`${server.baseUrl}/v1/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "nocookie", password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    // SAFETY: the sign in answers with JSON; the test reads only the two fields it names.
    const body = (await response.json()) as { twoFactorRequired?: boolean; token?: string };
    expect(body.twoFactorRequired).toBe(true);
    expect(body.token).toBeUndefined();
  });
});

describe("a server that requires two-factor", () => {
  beforeAll(async () => {
    required = await startServer({ REQUIRE_TWO_FACTOR: "true" }, { reset: false });
  }, HOOK_TIMEOUT);
  afterAll(() => required.stop(), HOOK_TIMEOUT);

  it("will not make a password account without an email address", async () => {
    await expect(
      required.client().signUp({ username: "nomail", password: PASSWORD }, DESKTOP),
    ).rejects.toThrow(/email address/i);
    const api = required.client();
    const user = await api.signUp(
      { username: "withmail", email: "withmail@example.com", password: PASSWORD },
      DESKTOP,
    );
    expect(user.email).toBe("withmail@example.com");
  });

  it("lets a new account in only to set it up, and everything else waits", async () => {
    const api = required.client();
    const user = await api.signUp(
      { username: "newbie", email: "newbie@example.com", password: PASSWORD },
      DESKTOP,
    );
    expect(user.twoFactorRequired).toBe(true);
    expect(await api.security()).toMatchObject({ required: true, enabled: false });
    await expect(api.sessions()).rejects.toThrow(/two-factor/i);
    // Syncing waits too, not only the devices list.
    await expect(api.devices()).rejects.toThrow(/two-factor/i);

    const start = await api.startAuthenticator();
    await api.confirmAuthenticator(await appCode(start.uri));
    expect((await api.me()).twoFactorRequired).toBeFalsy();
    expect(await api.sessions()).toBeArray();
  });

  it("will not let the last method go", async () => {
    const api = required.client();
    await api.signUp(
      { username: "keeper", email: "keeper@example.com", password: PASSWORD },
      DESKTOP,
    );
    const start = await api.startAuthenticator();
    await api.confirmAuthenticator(await appCode(start.uri));
    await expect(api.disableTwoFactor("totp")).rejects.toThrow(/required/i);
    expect((await api.security()).enabled).toBe(true);
  });

  it("asks an account made with a provider too", async () => {
    const api = await providerAccount(required, "prov2", "google");
    expect((await api.me()).twoFactorRequired).toBe(true);
    await expect(api.sessions()).rejects.toThrow(/two-factor/i);
    await api.enableEmailTwoFactor();
    expect(await api.sessions()).toBeArray();
  });
});

void usernameOf;

describe("a server that blocks disposable email addresses", () => {
  let blocking: TestServer;
  beforeAll(async () => {
    blocking = await startServer({ BLOCK_DISPOSABLE_EMAIL: "true" });
  }, HOOK_TIMEOUT);
  afterAll(() => blocking.stop(), HOOK_TIMEOUT);

  it("will not make an account with a throwaway address", async () => {
    await expect(
      blocking
        .client()
        .signUp(
          { username: "burner", email: "burner@mailinator.com", password: PASSWORD },
          DESKTOP,
        ),
    ).rejects.toThrow(/permanent email/i);
    const user = await blocking
      .client()
      .signUp({ username: "keeper", email: "keeper@example.com", password: PASSWORD }, DESKTOP);
    expect(user.email).toBe("keeper@example.com");
  });

  it("will not add a throwaway address to an account without one", async () => {
    const api = blocking.client();
    await api.signUp({ username: "nomail2", password: PASSWORD }, DESKTOP);
    await expect(api.addEmail("later@guerrillamail.com")).rejects.toThrow(/permanent email/i);
  });
});
