import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ApiRequestError } from "@nookly/shared/api";
import { fakeProviders, linkProvider, providerSignIn } from "./fake-providers.ts";
import {
  DESKTOP,
  HOOK_TIMEOUT,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  firstAnswer,
  hello,
  startServer,
  until,
  usernameOf,
  verifiedAccount,
} from "./helpers.ts";

// An app clears its device when the server says its session is over, released apps included:
// they take any 401, or `unauthorized` on the live socket, to mean that. So the server says
// it only to a device the person signed out with Sign Out Device. Every other session that
// stops working is refused as forbidden, and the device keeps its data.
let server: TestServer;
let providers: ReturnType<typeof fakeProviders>;

beforeAll(async () => {
  providers = fakeProviders();
  server = await startServer({ GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "secret" });
}, HOOK_TIMEOUT);
afterAll(async () => {
  providers.restore();
  await server.stop();
}, HOOK_TIMEOUT);

/// A phone that is signed in and in use, and notices being told to clear itself.
function phoneApp() {
  const tokens = new MemoryTokens();
  const phone = {
    tokens,
    cleared: false,
    api: server.client(tokens, () => (phone.cleared = true)),
  };
  return phone;
}

async function twoDevices(name: string) {
  const email = `${name}@example.com`;
  const { api: desktop } = await verifiedAccount(server, email, DESKTOP);
  const phone = phoneApp();
  await phone.api.signIn(usernameOf(email), PASSWORD, PHONE);
  await phone.api.me();
  const token = phone.tokens.token ?? "";
  return { desktop, phone, token, email };
}
type Phone = ReturnType<typeof phoneApp>;

const failure = async (promise: Promise<object | void>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiRequestError) return { status: error.status, code: error.code };
    throw error;
  }
  return null;
};

const onSocket = async (token: string) => JSON.parse(await firstAnswer(server, hello(token)));

/// Refused everywhere, in words that clear nothing.
async function expectLockedOut(phone: Phone, token: string) {
  expect(await failure(phone.api.me())).toEqual({ status: 403, code: "forbidden" });
  expect(await failure(phone.api.syncTransport().pull({ cursors: {} }))).toMatchObject({
    status: 403,
  });
  expect(await onSocket(token)).toEqual({ type: "error", code: "forbidden" });
  expect(phone.tokens.token).toBe(token);
  expect(phone.cleared).toBe(false);
}

/// The person presses Sign Out Device on the phone's row: now it is told, and clears.
async function signsOutFromTheList(desktop: Phone["api"], phone: Phone, token: string) {
  const row = (await desktop.sessions()).find((s) => s.deviceName === PHONE.name);
  if (!row) throw new Error("the phone isn't in the list");
  await desktop.revokeSession(row.id);
  expect(await onSocket(token)).toEqual({ type: "error", code: "unauthorized" });
  expect(await failure(phone.api.me())).toEqual({ status: 401, code: "unauthorized" });
  expect(phone.cleared).toBe(true);
  expect((await desktop.sessions()).map((s) => s.deviceName)).not.toContain(PHONE.name);
}

const devices = async (api: Phone["api"]) => (await api.sessions()).map((s) => s.deviceName).sort();

describe("Sign Out Device", () => {
  it("tells that device, and only it, that its session is over", async () => {
    const { desktop, phone, token } = await twoDevices("press");
    await signsOutFromTheList(desktop, phone, token);
    expect((await desktop.me()).username).toBe("press");
  });

  it("still tells it after the account is deleted", async () => {
    const { desktop, phone, token } = await twoDevices("gone");
    await signsOutFromTheList(desktop, phone, token);
    await desktop.deleteAccount(PASSWORD);
    expect(await onSocket(token)).toEqual({ type: "error", code: "unauthorized" });
  });
});

describe("a device that lost its sign in some other way", () => {
  it("keeps its data after a password reset, and can still be signed out", async () => {
    const { phone, token, email } = await twoDevices("reset");
    await server.client().forgotPassword(email);
    const link = server.mailer.link(email, "/reset-password");
    const reset = new URL(link ?? "").searchParams.get("token") ?? "";
    await server.client().resetPassword(reset, "a brand new password");
    await expectLockedOut(phone, token);

    const again = server.client();
    await again.signIn("reset", "a brand new password", DESKTOP);
    expect(await devices(again)).toContain(PHONE.name);
    await signsOutFromTheList(again, phone, token);
  });

  it("keeps its data after a long time unused, and is listed before and after it tries", async () => {
    const { desktop, phone, token } = await twoDevices("unused");
    await server.sql`UPDATE auth_session SET expires_at = now() - interval '1 day'
      WHERE token = ${token.split(".")[0]}`;
    expect(await devices(desktop)).toContain(PHONE.name);
    await expectLockedOut(phone, token);
    expect(await devices(desktop)).toContain(PHONE.name);
    await signsOutFromTheList(desktop, phone, token);
  });

  it("can be signed out while it is expired and hasn't tried again", async () => {
    const { desktop, phone, token } = await twoDevices("asleep");
    await server.sql`UPDATE auth_session SET expires_at = now() - interval '1 day'
      WHERE token = ${token.split(".")[0]}`;
    await signsOutFromTheList(desktop, phone, token);
  });

  it("keeps its data when the account is deleted from another device", async () => {
    const { desktop, phone, token } = await twoDevices("deleted");
    await desktop.deleteAccount(PASSWORD);
    await expectLockedOut(phone, token);
    const rows = await server.sql`SELECT device_name, user_id FROM auth_ended_session
      WHERE device_name IS NOT NULL
        AND user_id NOT IN (SELECT id FROM auth_user)`;
    expect(rows).toHaveLength(0);
  });

  it("keeps its data when its sign in method is disconnected", async () => {
    const { api: desktop } = await verifiedAccount(server, "dropped@example.com", DESKTOP);
    providers.people.set("dropped-gh", { id: 7, email: "dropped-gh@example.com", verified: true });
    await linkProvider(server, desktop, "github", "dropped-gh");
    const phone = phoneApp();
    await providerSignIn(server, phone.api, "github", "dropped-gh", PHONE);
    await phone.api.me();
    const token = phone.tokens.token ?? "";

    const heard: string[] = [];
    const socket = new WebSocket(`${server.baseUrl.replace("http", "ws")}/v1/sync/ws`);
    socket.addEventListener("message", (event) => heard.push(String(event.data)));
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "hello", token })));
    await until(() => heard.length > 0, "ready");

    await desktop.unlink("github");
    await until(() => heard.length > 1, "the socket to hear it");
    expect(JSON.parse(heard[1])).toEqual({ type: "error", code: "forbidden" });
    await expectLockedOut(phone, token);
    await signsOutFromTheList(desktop, phone, token);
  });

  it("keeps its data when the server no longer knows the session at all", async () => {
    // An older database put back, or a session lost to a fault.
    const { phone, token } = await twoDevices("lost");
    await server.sql`DELETE FROM auth_session WHERE token = ${token.split(".")[0]}`;
    await server.sql`DELETE FROM auth_ended_session`;
    await expectLockedOut(phone, token);
  });

  it("is never answered 401 on any route, with the session or with it lost on the way", async () => {
    const calls = server.app.routes
      .filter((route) => route.path.startsWith("/v1/") && !route.path.endsWith("ws"))
      .filter((route) => route.path !== "/v1/collab" && route.path !== "/v1/auth/*")
      .map((route) => [route.method, route.path.replace(/:\w+/g, "x")]);
    // Everything of better-auth's the server lets through.
    for (const path of [
      "sign-out",
      "change-password",
      "send-verification-email",
      "request-password-reset",
      "reset-password",
      "sign-in/email",
      "sign-in/username",
      "two-factor/send-otp",
      "two-factor/verify-totp",
    ]) {
      calls.push(["POST", `/v1/auth/${path}`]);
    }
    expect(calls.length).toBeGreaterThan(30);
    // Signing in is how an app gets a session, so a wrong password there stays a 401: the
    // apps send no session with it, and nothing is cleared.
    const signingIn = /^\/v1\/auth\/(sign-in|two-factor)\//;
    for (const [method, path] of calls) {
      for (const authorization of ["Bearer unknown", null]) {
        if (authorization === null && signingIn.test(path)) continue;
        const headers = new Headers({ "content-type": "application/json" });
        if (authorization !== null) headers.set("authorization", authorization);
        const response = await fetch(`${server.baseUrl}${path}`, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : "{}",
        });
        expect(response.status, `${method} ${path} ${authorization}`).not.toBe(401);
      }
    }
    expect(await onSocket("")).toEqual({ type: "error", code: "forbidden" });
  });

  it("is answered in words that clear nothing before it has said hello", async () => {
    const answer = await firstAnswer(server, { type: "ack", dataset: "own", cursor: 0 });
    expect(JSON.parse(answer)).toEqual({ type: "error", code: "forbidden" });
  });
});

describe("the list of devices", () => {
  it("forgets a device that signed itself out", async () => {
    const { desktop, phone } = await twoDevices("leaver");
    await phone.api.signOut();
    expect(await devices(desktop)).toEqual([DESKTOP.name]);
  });

  it("gains no entry from the half step of a sign in with a second step", async () => {
    const { api: desktop } = await verifiedAccount(server, "twostep@example.com", DESKTOP);
    await desktop.enableEmailTwoFactor();
    const phone = server.client();
    await expect(phone.signIn("twostep", PASSWORD, PHONE)).rejects.toThrow();
    expect(await devices(desktop)).toEqual([DESKTOP.name]);
  });
});
