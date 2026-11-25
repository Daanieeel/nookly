import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { ApiClient, ApiRequestError, TwoFactorRequiredError } from "@nookly/shared/api";
import { browserLeg, fakeProviders, providerSignIn } from "./fake-providers.ts";
import {
  DESKTOP,
  HOOK_TIMEOUT,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  startServer,
  verifiedAccount,
} from "./helpers.ts";

// Linked sign in providers: one account, several ways to sign in, one of them primary.
let server: TestServer;
let providers: ReturnType<typeof fakeProviders>;

beforeAll(async () => {
  providers = fakeProviders();
  server = await startServer({
    GITHUB_CLIENT_ID: "github-id",
    GITHUB_CLIENT_SECRET: "github-secret",
    NOTION_CLIENT_ID: "notion-id",
    NOTION_CLIENT_SECRET: "notion-secret",
  });
}, HOOK_TIMEOUT);
afterAll(async () => {
  providers.restore();
  await server.stop();
}, HOOK_TIMEOUT);

let nextId = 1;
/// A person at the providers, known by `key`.
function person(key: string, email: string | null = `${key}@example.com`, verified = true) {
  providers.people.set(key, { id: nextId++, email, verified });
  return key;
}

const fresh = () => server.client(new MemoryTokens());

/// Makes every session of the account older than a recheck lasts.
async function age(username: string) {
  await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour',
    reauthed_at = NULL
    WHERE user_id = (SELECT id FROM auth_user WHERE username = ${username})`;
}

/// The code in the newest mail to `to`.
function mailedCode(to: string): string {
  const mail = [...server.mailer.sent]
    .reverse()
    .find((m) => m.to === to && /\b\d{6}\b/.test(m.text));
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no code was emailed to ${to}`);
  return code;
}

async function appCode(uri: string): Promise<string> {
  const key = new URL(uri).searchParams.get("secret") ?? "";
  return createOTP(base32.decode(key)).totp();
}

const refusal = async (promise: Promise<object | void>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiRequestError) return error.code;
    throw error;
  }
  return "allowed";
};

/// Connects a provider the way the apps do.
async function link(api: ReturnType<typeof fresh>, provider: "github" | "notion", key: string) {
  const begun = await api.beginLink({ provider });
  const back = await browserLeg(server, provider, begun, key);
  if (!back.code) throw new Error(back.error ?? "no code");
  return api.finishLink(back.code, begun.secret);
}

describe("an account made with a provider", () => {
  it("has it as its primary, with the email it shared", async () => {
    const api = fresh();
    person("octo");
    await providerSignIn(server, api, "github", "octo", DESKTOP, { createAccount: true });
    expect(await api.signInMethods()).toEqual({
      methods: [
        {
          provider: "github",
          email: "octo@example.com",
          emailVerified: true,
          primary: true,
          canBePrimary: false,
        },
      ],
      current: "github",
      fresh: true,
      secondStep: [],
      offered: ["github", "notion"],
    });
  });

  it("may have no email at all, when the provider shares none", async () => {
    const api = fresh();
    person("quiet", null);
    const user = await providerSignIn(server, api, "notion", "quiet", DESKTOP, {
      createAccount: true,
    });
    expect(user.email).toBeNull();
    expect((await api.signInMethods()).methods[0]).toMatchObject({
      provider: "notion",
      email: null,
      primary: true,
    });
    // And signs in again.
    const again = await providerSignIn(server, fresh(), "notion", "quiet", PHONE);
    expect(again.id).toBe(user.id);
  });

  it("is not reached by another provider that shares its email", async () => {
    await verifiedAccount(server, "owner@example.com");
    person("lookalike", "owner@example.com");
    await expect(
      providerSignIn(server, fresh(), "github", "lookalike", DESKTOP, { createAccount: true }),
    ).rejects.toThrow("account_not_linked");
    await expect(providerSignIn(server, fresh(), "github", "lookalike", DESKTOP)).rejects.toThrow(
      "account_not_linked",
    );
  });

  it("is refused for an email any of an account's sign in methods uses", async () => {
    const { api } = await verifiedAccount(server, "first@example.com");
    person("second", "second@example.com");
    await link(api, "github", "second");
    person("third", "second@example.com");
    await expect(
      providerSignIn(server, fresh(), "notion", "third", DESKTOP, { createAccount: true }),
    ).rejects.toThrow("account_not_linked");
    await expect(
      fresh().signUp(
        { username: "copy", email: "second@example.com", password: PASSWORD },
        DESKTOP,
      ),
    ).rejects.toThrow(/exists/i);
  });
});

describe("connecting a provider", () => {
  it("lets it sign in to the same account, and leaves the primary as it was", async () => {
    const { api, user } = await verifiedAccount(server, "linker@example.com");
    person("linker-gh", "work@example.com");
    const after = await link(api, "github", "linker-gh");
    expect(after.methods.map((m) => [m.provider, m.primary, m.canBePrimary])).toEqual([
      ["credential", true, false],
      ["github", false, true],
    ]);
    const second = fresh();
    expect((await providerSignIn(server, second, "github", "linker-gh", PHONE)).id).toBe(user.id);
    expect((await second.signInMethods()).current).toBe("github");
  });

  it("links nothing until the app that began it takes the code", async () => {
    const { api } = await verifiedAccount(server, "victimless@example.com");
    person("victim", "victim@example.com");
    const begun = await api.beginLink({ provider: "github" });
    const back = await browserLeg(server, "github", begun, "victim");
    expect(back.code).toBeString();
    expect((await api.signInMethods()).methods).toHaveLength(1);
    // Whoever only began it, without the code the browser got, links nothing either.
    await expect(api.finishLink("a".repeat(43), begun.secret)).rejects.toThrow();
    await expect(api.finishLink(back.code ?? "", "x".repeat(43))).rejects.toThrow();
    const { api: stranger } = await verifiedAccount(server, "stranger@example.com");
    await expect(stranger.finishLink(back.code ?? "", begun.secret)).rejects.toThrow();
    expect((await stranger.signInMethods()).methods).toHaveLength(1);
  });

  it("refuses a provider that another account uses, and a second one of a kind", async () => {
    const { api: one } = await verifiedAccount(server, "one@example.com");
    person("shared");
    await link(one, "github", "shared");
    const { api: two } = await verifiedAccount(server, "two@example.com");
    await expect(link(two, "github", "shared")).rejects.toThrow(/another Nookly account/);
    expect(await refusal(one.beginLink({ provider: "github" }))).toBe("already_linked");
  });

  it("makes it primary when the primary has no confirmed email", async () => {
    const api = fresh();
    person("silent", null);
    await providerSignIn(server, api, "notion", "silent", DESKTOP, { createAccount: true });
    person("loud", "loud@example.com");
    const after = await link(api, "github", "loud");
    expect(after.methods.find((m) => m.primary)?.provider).toBe("github");
    expect((await api.me()).email).toBe("loud@example.com");
  });
});

describe("the primary", () => {
  it("moves the account's email with it, and leaves Nookly Signin's own", async () => {
    const { api } = await verifiedAccount(server, "move@example.com");
    person("move-gh", "moved@example.com");
    await link(api, "github", "move-gh");
    const after = await api.setPrimary("github");
    expect(after.methods.find((m) => m.primary)?.provider).toBe("github");
    expect((await api.me()).email).toBe("moved@example.com");
    const [row] = await server.sql`SELECT email FROM users
      WHERE id = (SELECT id FROM auth_user WHERE username = 'move')`;
    expect(row.email).toBe("moved@example.com");
    // The password still signs in with the address it always had, and not with the new one.
    expect((await fresh().signIn("move@example.com", PASSWORD, DESKTOP)).username).toBe("move");
    await expect(fresh().signIn("moved@example.com", PASSWORD, DESKTOP)).rejects.toThrow();
    expect((await fresh().signIn("move", PASSWORD, DESKTOP)).username).toBe("move");
  });

  it("cannot be one without a confirmed email, or be disconnected", async () => {
    const { api } = await verifiedAccount(server, "keep@example.com");
    person("keep-no", null);
    await link(api, "notion", "keep-no");
    expect(await refusal(api.setPrimary("notion"))).toBe("email_unconfirmed");
    expect(await refusal(api.unlink("credential"))).toBe("primary_method");
  });
});

describe("disconnecting", () => {
  it("forgets the provider and signs out what came through it", async () => {
    const { api } = await verifiedAccount(server, "drop@example.com");
    person("drop-gh");
    await link(api, "github", "drop-gh");
    const through = fresh();
    await providerSignIn(server, through, "github", "drop-gh", PHONE);
    const after = await api.unlink("github");
    expect(after.signedOut).toBe(false);
    expect(after.methods.map((m) => m.provider)).toEqual(["credential"]);
    await expect(through.me()).rejects.toThrow();
    expect((await api.me()).username).toBe("drop");
    const rows = await server.sql`SELECT 1 FROM auth_account WHERE provider_id = 'github'
      AND user_id = (SELECT id FROM auth_user WHERE username = 'drop')`;
    expect(rows).toHaveLength(0);
    // It reaches this account no more: a server without a beta key makes it a new one.
    const stranger = await providerSignIn(server, fresh(), "github", "drop-gh", PHONE);
    expect(stranger.id).not.toBe((await api.me()).id);
  });

  it("says so when it signs this device out too", async () => {
    const { api } = await verifiedAccount(server, "self@example.com");
    person("self-gh", "self-gh@example.com");
    await link(api, "github", "self-gh");
    const through = fresh();
    await providerSignIn(server, through, "github", "self-gh", PHONE);
    expect((await through.unlink("github")).signedOut).toBe(true);
    expect(await through.isSignedIn()).toBe(false);
  });
});

describe("Nookly Signin", () => {
  it("is added with an email confirmed by a code and a password, and removed", async () => {
    const api = fresh();
    person("adder");
    const user = await providerSignIn(server, api, "github", "adder", DESKTOP, {
      createAccount: true,
    });
    await api.setUsername("adder_name");
    await api.sendEmailCode("credential", "own@example.com");
    expect(await refusal(api.addPassword("own@example.com", "000000x", PASSWORD))).toBe(
      "invalid_code",
    );
    const after = await api.addPassword("own@example.com", mailedCode("own@example.com"), PASSWORD);
    expect(after.methods.find((m) => m.provider === "credential")).toMatchObject({
      email: "own@example.com",
      emailVerified: true,
      primary: false,
    });
    expect((await fresh().signIn("own@example.com", PASSWORD, DESKTOP)).id).toBe(user.id);
    expect((await fresh().signIn("adder_name", PASSWORD, DESKTOP)).id).toBe(user.id);
    expect((await api.unlink("credential")).methods).toHaveLength(1);
    await expect(fresh().signIn("adder_name", PASSWORD, DESKTOP)).rejects.toThrow();
  });

  it("is never made by a password reset", async () => {
    person("noreset", "noreset@example.com");
    await providerSignIn(server, fresh(), "github", "noreset", DESKTOP, { createAccount: true });
    const sent = server.mailer.sent.length;
    await fresh().forgotPassword("noreset@example.com");
    expect(server.mailer.sent.slice(sent).filter((m) => m.text.includes("reset"))).toEqual([]);
  });

  it("resets through its own email, whatever the primary", async () => {
    const { api } = await verifiedAccount(server, "reset@example.com");
    person("reset-gh", "primary-reset@example.com");
    await link(api, "github", "reset-gh");
    await api.setPrimary("github");
    await fresh().forgotPassword("reset@example.com");
    const reset = server.mailer.link("reset@example.com", "/reset-password");
    expect(reset).toBeString();
    const token = new URL(reset ?? "").searchParams.get("token") ?? "";
    await fresh().resetPassword(token, `${PASSWORD} new`);
    expect((await fresh().signIn("reset@example.com", `${PASSWORD} new`, DESKTOP)).username).toBe(
      "reset",
    );
  });

  it("gets a new password after a recheck, without the old one", async () => {
    const { api } = await verifiedAccount(server, "recover@example.com");
    await api.setPassword(`${PASSWORD} recovered`);
    expect((await fresh().signIn("recover", `${PASSWORD} recovered`, DESKTOP)).username).toBe(
      "recover",
    );
  });

  it("changes its email with a code, and refuses a taken one", async () => {
    const { api } = await verifiedAccount(server, "rename@example.com");
    await verifiedAccount(server, "taken@example.com");
    expect(await refusal(api.sendEmailCode("credential", "Taken@example.com"))).toBe("email_taken");
    await api.sendEmailCode("credential", "renamed@example.com");
    const code = mailedCode("renamed@example.com");
    // The code is for the address it was sent to.
    expect(await refusal(api.changeEmail("credential", "else@example.com", code))).toBe(
      "invalid_code",
    );
    await api.changeEmail("credential", "renamed@example.com", code);
    expect((await api.me()).email).toBe("renamed@example.com");
    await expect(fresh().signIn("rename@example.com", PASSWORD, DESKTOP)).rejects.toThrow();
    expect((await fresh().signIn("renamed@example.com", PASSWORD, DESKTOP)).username).toBe(
      "rename",
    );
  });

  it("keeps an email changed here when the provider signs in again", async () => {
    const api = fresh();
    person("chosen", "chosen@example.com");
    await providerSignIn(server, api, "github", "chosen", DESKTOP, { createAccount: true });
    await api.sendEmailCode("github", "mine@example.com");
    await api.changeEmail("github", "mine@example.com", mailedCode("mine@example.com"));
    await providerSignIn(server, fresh(), "github", "chosen", PHONE);
    expect((await api.me()).email).toBe("mine@example.com");
  });
});

describe("a recheck", () => {
  it("is needed once the sign in is older than ten minutes", async () => {
    const { api } = await verifiedAccount(server, "stale@example.com");
    await age("stale");
    expect((await api.signInMethods()).fresh).toBe(false);
    for (const change of [
      () => api.beginLink({ provider: "github" }),
      () => api.unlink("credential"),
      () => api.setPrimary("credential"),
      () => api.sendEmailCode("credential", "new@example.com"),
      () => api.changeEmail("credential", "new@example.com", "123456"),
      () => api.setPassword(`${PASSWORD} two`),
      () => api.changePassword(PASSWORD, `${PASSWORD} two`),
      () => api.enableEmailTwoFactor(),
      () => api.startAuthenticator(),
      () => api.disableTwoFactor("email"),
      () => api.newBackupCodes(),
      () => api.addEmail("added@example.com"),
    ]) {
      expect(await refusal(change())).toBe("recheck_required");
    }
    expect(await refusal(api.recheck({ password: "wrong password" }))).toBe("wrong_password");
    await api.recheck({ password: PASSWORD });
    expect((await api.signInMethods()).fresh).toBe(true);
    await api.enableEmailTwoFactor();
  });

  it("asks for the second step too, once the account has one", async () => {
    const { api } = await verifiedAccount(server, "second@recheck.example.com");
    await api.enableEmailTwoFactor();
    const setup = await api.startAuthenticator();
    const codes = await api.confirmAuthenticator(await appCode(setup.uri));
    await age("second");
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour'`;
    expect(await refusal(api.recheck({ password: PASSWORD }))).toBe("second_step_required");
    expect(await refusal(api.recheck({ password: PASSWORD, method: "totp", code: "000000" }))).toBe(
      "invalid_code",
    );
    await api.recheck({ password: PASSWORD, method: "totp", code: await appCode(setup.uri) });
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour',
      reauthed_at = NULL`;
    await api.sendRecheckCode();
    await api.recheck({
      password: PASSWORD,
      method: "email",
      code: mailedCode("second@recheck.example.com"),
    });
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour',
      reauthed_at = NULL`;
    const backup = codes[0] ?? "";
    await api.recheck({ password: PASSWORD, method: "backup", code: backup });
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour',
      reauthed_at = NULL`;
    // A recovery code works once.
    expect(await refusal(api.recheck({ password: PASSWORD, method: "backup", code: backup }))).toBe(
      "invalid_code",
    );
  });

  it("can be made with a provider instead of a password", async () => {
    const api = fresh();
    person("vouch", "vouch@example.com");
    await providerSignIn(server, api, "github", "vouch", DESKTOP, { createAccount: true });
    await age("vouch");
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour'`;
    expect(await refusal(api.recheck({}))).toBe("confirmation_required");
    const begun = await api.beginConfirmation({ provider: "github" });
    const back = await browserLeg(server, "github", begun, "vouch");
    await api.finishConfirmation(back.code ?? "", begun.secret);
    await api.recheck({});
    expect((await api.signInMethods()).fresh).toBe(true);
    // Used up.
    await server.sql`UPDATE auth_session SET created_at = now() - interval '1 hour',
      reauthed_at = NULL`;
    expect(await refusal(api.recheck({}))).toBe("confirmation_required");
  });
});

describe("a provider sign in to an account with two-factor", () => {
  it("asks for the second step, and gives no session before it", async () => {
    const api = fresh();
    person("guarded", "guarded@example.com");
    const user = await providerSignIn(server, api, "github", "guarded", DESKTOP, {
      createAccount: true,
    });
    await api.enableEmailTwoFactor();

    const phone = fresh();
    const asked = await providerSignIn(server, phone, "github", "guarded", PHONE).catch(
      (error) => error,
    );
    if (!(asked instanceof TwoFactorRequiredError)) throw new Error("no second step asked");
    expect(asked.methods).toEqual(["email"]);
    expect(await phone.isSignedIn()).toBe(false);
    await phone.sendTwoFactorEmail(asked.challenge);
    const signedIn = await phone.verifyTwoFactor(
      asked.challenge,
      "email",
      mailedCode("guarded@example.com"),
      PHONE,
    );
    expect(signedIn.id).toBe(user.id);
    expect((await phone.signInMethods()).current).toBe("github");
  });

  it("leaves the browser's own session unable to do anything", async () => {
    const api = fresh();
    person("browserless", "browserless@example.com");
    await providerSignIn(server, api, "github", "browserless", DESKTOP, { createAccount: true });
    await api.enableEmailTwoFactor();
    const begun = await api.beginProviderSignIn({ provider: "github" });
    const state = new URL(begun.url).searchParams.get("state");
    const callback = await fetch(
      `${server.baseUrl}/v1/auth/callback/github?code=browserless&state=${state}`,
      { redirect: "manual" },
    );
    const cookie = callback.headers.getSetCookie().find((line) => line.includes("session_token="));
    const token = decodeURIComponent(cookie?.split("=")[1]?.split(";")[0] ?? "");
    expect(token).toContain(".");
    const tokens = new MemoryTokens();
    tokens.token = token;
    await expect(server.client(tokens).me()).rejects.toThrow();
    expect((await api.sessions()).length).toBe(1);
  });
});

describe("better-auth's own account routes", () => {
  it("are shut: they would change how an account signs in without a recheck", async () => {
    const { api } = await verifiedAccount(server, "raw@example.com");
    const token = await api.sessionToken();
    for (const [method, path] of [
      ["POST", "unlink-account"],
      ["POST", "link-social"],
      ["POST", "update-user"],
      ["POST", "change-email"],
      ["POST", "delete-user"],
      ["GET", "list-accounts"],
      ["POST", "get-access-token"],
      ["POST", "set-password"],
    ]) {
      const response = await fetch(`${server.baseUrl}/v1/auth/${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(`${path} ${response.status}`).toBe(`${path} 404`);
    }
  });
});

describe("a server that requires two-factor", () => {
  let required: TestServer;
  beforeAll(async () => {
    required = await startServer(
      {
        REQUIRE_TWO_FACTOR: "true",
        GITHUB_CLIENT_ID: "github-id",
        GITHUB_CLIENT_SECRET: "github-secret",
      },
      { reset: false },
    );
  }, HOOK_TIMEOUT);
  afterAll(() => required.stop(), HOOK_TIMEOUT);

  /// An app from before this feature: it never says what it can do.
  const older = (tokens = new MemoryTokens()) =>
    new ApiClient({
      baseUrl: required.baseUrl,
      tokens,
      fetch: (url, init) => globalThis.fetch(url.replace(/[?&]auth=2/, ""), init),
    });

  it("asks a provider account for it too", async () => {
    const api = required.client();
    person("must", "must@example.com");
    const user = await providerSignIn(required, api, "github", "must", DESKTOP, {
      createAccount: true,
    });
    expect(user.twoFactorRequired).toBe(true);
    expect(await refusal(api.sessions())).toBe("two_factor_required");
    await api.enableEmailTwoFactor();
    expect(await api.sessions()).toBeArray();
  });

  it("tells an older app to update, on sign in, sign up and sync", async () => {
    const api = required.client();
    await api.signUp(
      { username: "olduser", email: "olduser@example.com", password: PASSWORD },
      DESKTOP,
    );
    const token = await api.sessionToken();
    const tokens = new MemoryTokens();
    tokens.token = token;
    const old = older(tokens);
    for (const attempt of [
      () => old.me(),
      () => old.devices(),
      () => older().signIn("olduser", PASSWORD, DESKTOP),
      () =>
        older().signUp(
          { username: "newold", email: "newold@example.com", password: PASSWORD },
          DESKTOP,
        ),
    ]) {
      await expect(attempt()).rejects.toThrow("Update Nookly to continue.");
    }
    expect(await required.sql`SELECT 1 FROM auth_user WHERE username = 'newold'`).toHaveLength(0);
    // Leaving for good is still possible.
    await old.deleteAccount(PASSWORD);
  });

  it("tells an older app to update after a provider sign in", async () => {
    const api = required.client();
    person("oldprov", "oldprov@example.com");
    await providerSignIn(required, api, "github", "oldprov", DESKTOP, { createAccount: true });
    await expect(providerSignIn(required, older(), "github", "oldprov", DESKTOP)).rejects.toThrow(
      "Update Nookly to continue.",
    );
    await api.enableEmailTwoFactor();
    await expect(providerSignIn(required, older(), "github", "oldprov", DESKTOP)).rejects.toThrow(
      "Update Nookly to continue.",
    );
  });

  it("leaves an older app with two-factor signing in as before", async () => {
    const api = required.client();
    await api.signUp(
      { username: "ready", email: "ready@example.com", password: PASSWORD },
      DESKTOP,
    );
    const confirm = required.mailer.link("ready@example.com", "/v1/auth/verify-email");
    await fetch((confirm ?? "").replace("http://nookly.test", required.baseUrl));
    await api.enableEmailTwoFactor();
    await expect(older().signIn("ready", PASSWORD, DESKTOP)).rejects.toBeInstanceOf(
      TwoFactorRequiredError,
    );
  });
});
