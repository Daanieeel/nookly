import type { z } from "zod";
import {
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type DeviceName,
  type ConflictReport,
  type ConflictReported,
  type ServerConflict,
  type ServerMessage,
  conflictReportedSchema,
  devicesSchema,
  missingResponseSchema,
  serverConflictsSchema,
  pullResponseSchema,
  pushResponseSchema,
  serverMessageSchema,
} from "../sync/protocol.ts";
import { type LiveHandlers, NetworkError, type SyncTransport } from "../sync/client.ts";
import {
  type DeviceInfo,
  type AuthenticatorStart,
  type ProviderBeginInput,
  type Recheck,
  type SecuritySummary,
  type SignInChange,
  type SignInSummary,
  type Session,
  type Share,
  type ShareRole,
  type SignUp,
  type TwoFactorMethod,
  type User,
  AUTH_LEVEL,
  AUTH_QUERY,
  authResponseSchema,
  authenticatorStartSchema,
  backupCodesSchema,
  createShareResponseSchema,
  healthSchema,
  providerBeginResponseSchema,
  providersResponseSchema,
  securitySummarySchema,
  sessionsResponseSchema,
  sharesResponseSchema,
  signInChangeSchema,
  signInSummarySchema,
  twoFactorChallengeSchema,
  userSchema,
} from "./schemas.ts";
import { z as zod } from "zod";
import {
  APP_OUTDATED,
  APP_OUTDATED_MESSAGE,
  SERVER_OUTDATED,
  SERVER_OUTDATED_MESSAGE,
  SERVER_VERSION_HEADER,
  versionProblem,
} from "./server-version.ts";

/// Where a client keeps its session token: the desktop's keychain, the phone's
/// secure store. It is what keeps a device signed in across restarts.
export interface TokenStore {
  load(): Promise<string | null>;
  save(token: string | null): Promise<void>;
}

/// Errors from our routes (`{ error, message }`) and from better-auth's (`{ code,
/// message }`) read the same.
const errorBodySchema = zod.object({
  error: zod.string().optional(),
  code: zod.string().optional(),
  message: zod.string().optional(),
  /// The server's version, which our own routes put in every error.
  serverVersion: zod.string().optional(),
});

/// What people read for better-auth's error codes: short, and saying what to do.
const FRIENDLY = new Map([
  ["username_is_already_taken", "That username is taken. Try another one."],
  ["user_already_exists", "An account with this email exists. Sign in instead."],
  ["user_already_exists_use_another_email", "An account with this email exists. Sign in instead."],
  ["invalid_username_or_password", "The username or the password is wrong."],
  ["invalid_email_or_password", "The email or the password is wrong."],
  ["password_too_short", "Use at least 10 characters for the password."],
  ["password_too_long", "That password is too long."],
  ["invalid_password", "The current password is wrong."],
  ["invalid_token", "This link has expired or was already used."],
  ["username_too_short", "Use at least 3 characters for the username."],
  ["username_too_long", "Use at most 30 characters for the username."],
  ["invalid_username", "Use only letters, digits, dots and underscores in the username."],
  ["invalid_email", "That email address doesn't look right."],
]);

/// Headers a device names itself with, for its session (the devices list).
export function deviceHeaders(device: DeviceInfo) {
  return { "x-nookly-device-name": device.name, "x-nookly-platform": device.platform };
}

/// A password sign in that is not done: the account has two-factor, so the server wants a
/// second step before it starts a session. Carries what the second step needs.
export class TwoFactorRequiredError extends Error {
  readonly challenge: string;
  readonly methods: TwoFactorMethod[];

  constructor(challenge: string, methods: TwoFactorMethod[]) {
    super("Enter the code to finish signing in.");
    this.challenge = challenge;
    this.methods = methods;
  }
}

/// The header that carries a sign in's challenge to the second step.
export const CHALLENGE_HEADER = "x-nookly-challenge";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  /// The version the server said it is, when the answer carried one.
  readonly serverVersion?: string;

  constructor(status: number, code: string, message: string, serverVersion?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.serverVersion = serverVersion;
  }
}

/// The error codes of a request the server could not read: a body that failed its checks.
const UNREADABLE = new Set(["invalid_request", "invalid_body"]);

/// The error that says which side is out of date, or null when neither is.
function outdatedError(status: number, serverVersion: string | undefined): ApiRequestError | null {
  const problem = versionProblem(serverVersion);
  if (problem === "server") {
    return new ApiRequestError(status, SERVER_OUTDATED, SERVER_OUTDATED_MESSAGE, serverVersion);
  }
  if (problem === "app") {
    return new ApiRequestError(status, APP_OUTDATED, APP_OUTDATED_MESSAGE, serverVersion);
  }
  return null;
}

/// An error response as an `ApiRequestError`. A request the server could not read, from an app
/// and a server of different versions, says which of the two is out of date instead of what
/// was wrong with the request, which nobody can do anything about.
async function requestError(
  response: Response,
  friendly: ReadonlyMap<string, string> | null,
): Promise<ApiRequestError> {
  const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
  const data = parsed.success ? parsed.data : {};
  const code = (data.error ?? data.code ?? "http_error").toLowerCase();
  const serverVersion =
    data.serverVersion ?? response.headers.get(SERVER_VERSION_HEADER) ?? undefined;
  if (UNREADABLE.has(code)) {
    const outdated = outdatedError(response.status, serverVersion);
    if (outdated) return outdated;
  }
  return new ApiRequestError(
    response.status,
    code,
    friendly?.get(code) ?? data.message ?? `Request failed (${response.status})`,
    serverVersion,
  );
}

/// An API address, saying what this app can do at sign in.
function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}${path.includes("?") ? "&" : "?"}${AUTH_QUERY}=${AUTH_LEVEL}`;
}

/// `fetch`, as far as the client uses it.
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/// How often the live channel pings, and how long without hearing anything it takes
/// for dead.
const LIVE_PING_MS = 15_000;
const LIVE_SILENCE_MS = 40_000;
/// How long the live channel may take to open and be let in before it is tried again: a
/// network that changed can leave an attempt hanging for minutes.
const LIVE_CONNECT_MS = 10_000;
/// How long a request may take before it counts as unreachable. A connection that died
/// without a word (a laptop that slept, a phone that changed network) never answers, and
/// sync waits for each request before the next.
const REQUEST_TIMEOUT_MS = 45_000;

/// The parts of a `WebSocket` the live channel uses.
export interface LiveSocket {
  addEventListener(type: "open" | "close", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  send(message: string): void;
  close(): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: FetchLike;
  /// Builds the live sync socket; defaults to the global `WebSocket`.
  webSocket?: (url: string) => LiveSocket;
  /// Told when the account signs out on its own, like a revoked session.
  onSignedOut?: () => void;
}

const JSON_HEADERS = { "content-type": "application/json" };

/// A request body: anything that serializes to JSON.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type Body = { [key: string]: JsonValue };

/// One client for the whole API, shared by the desktop and the mobile app. It signs
/// requests with the session token. A token the server no longer accepts (signed out
/// elsewhere, expired) is forgotten, and `onSignedOut` is told.
export class ApiClient {
  readonly baseUrl: string;
  private readonly store: TokenStore;
  private readonly fetchImpl: FetchLike;
  private readonly webSocket: (url: string) => LiveSocket;
  private readonly onSignedOut?: () => void;
  private token: string | null | undefined = undefined;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.store = options.tokens;
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.webSocket = options.webSocket ?? ((url) => new WebSocket(url));
    this.onSignedOut = options.onSignedOut;
  }

  /// The session token, read from the store once.
  async sessionToken(): Promise<string | null> {
    if (this.token === undefined) this.token = await this.store.load();
    return this.token;
  }

  private async send<T>(
    method: string,
    path: string,
    schema: z.ZodType<T> | null,
    body?: Body,
    options: { authed?: boolean; headers?: Record<string, string> } = {},
  ): Promise<T | null> {
    const authed = options.authed ?? true;
    const headers = new Headers(options.headers);
    if (body) headers.set("content-type", JSON_HEADERS["content-type"]);
    const token = authed ? await this.sessionToken() : null;
    if (authed && !token) throw new ApiRequestError(401, "unauthorized", "Sign in first.");
    if (token) headers.set("authorization", `Bearer ${token}`);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(apiUrl(this.baseUrl, path), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          // The token is the credential; a cookie jar's leftovers must not ride along.
          credentials: "omit",
          signal: abort.signal,
        });
      } catch (error) {
        throw NetworkError.unreachable(error);
      }
      if (authed && response.status === 401 && token) await this.ended(token);
      if (!response.ok) {
        throw await requestError(response, FRIENDLY);
      }
      if (!schema) return null;
      try {
        return schema.parse(await response.json());
      } catch (error) {
        // The body stopped coming: the connection went while it was read.
        if (abort.signal.aborted) throw NetworkError.unreachable(error);
        // An answer that is not the shape this app reads: the two are not the same version.
        if (error instanceof zod.ZodError) {
          throw (
            outdatedError(
              response.status,
              response.headers.get(SERVER_VERSION_HEADER) ?? undefined,
            ) ?? error
          );
        }
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async call<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: Body,
    options?: { authed?: boolean; headers?: Record<string, string> },
  ): Promise<T> {
    const result = await this.send(method, path, schema, body, options);
    if (result === null) throw new Error("Empty response");
    return result;
  }

  private async callVoid(
    method: string,
    path: string,
    body?: Body,
    options?: { authed?: boolean; headers?: Record<string, string> },
  ): Promise<void> {
    await this.send(method, path, null, body, options);
  }

  private async adopt(token: string | null) {
    if (!token) throw new ApiRequestError(500, "no_session", "The server didn't start a session.");
    this.token = token;
    await this.store.save(token);
  }

  private async forget() {
    this.token = null;
    await this.store.save(null);
  }

  /// The server no longer takes `token`. When it is still this device's session, the
  /// device is signed out. When the store already holds another one (signed out and into
  /// an account again since), only this client lets go: a request of the old session that
  /// comes back late must never sign out the account signed in after it.
  private async ended(token: string) {
    const current = await this.store.load();
    if (current !== null && current !== token) {
      this.token = null;
      return;
    }
    await this.forget();
    this.onSignedOut?.();
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.sessionToken()) !== null;
  }

  async health(): Promise<{ status: "ok"; version: string }> {
    return this.call("GET", "/health", healthSchema, undefined, { authed: false });
  }

  /// The OAuth providers this server offers, besides username and password.
  async providers(): Promise<string[]> {
    const result = await this.call(
      "GET",
      "/v1/auth/providers",
      providersResponseSchema,
      undefined,
      {
        authed: false,
      },
    );
    return result.providers;
  }

  /// Starts a sign in with a provider (`google`, `github`, `notion`): the address to open in
  /// the browser, and the secret that makes the code coming back usable by this app only.
  /// `port` is the loopback port a desktop listens on; a phone has none. A new account needs
  /// `createAccount`, and the beta key while the server is closed.
  beginProviderSignIn(input: ProviderBeginInput) {
    const { betaKey, ...rest } = input;
    const body: ProviderBeginInput = { ...rest };
    const key = betaKey?.trim();
    if (key) body.betaKey = key;
    return this.call("POST", "/v1/auth/app/begin", providerBeginResponseSchema, body, {
      authed: false,
    });
  }

  /// Begins confirming with the provider the account signs in with, before something that
  /// cannot be undone. `port` is the desktop's loopback port, as when signing in.
  beginConfirmation(input: { provider: string; port?: number }) {
    return this.call("POST", "/v1/account/confirm/begin", providerBeginResponseSchema, input);
  }

  /// Swaps the code the browser brought back for the confirmation, which the next deletion
  /// of the account uses up.
  finishConfirmation(code: string, secret: string): Promise<void> {
    return this.callVoid("POST", "/v1/account/confirm/redeem", { code, secret });
  }

  /// Swaps the code the browser brought back for this device's session. An account with
  /// two-factor is not signed in yet: this throws `TwoFactorRequiredError`, as `signIn` does.
  async finishProviderSignIn(code: string, secret: string, device: DeviceInfo): Promise<User> {
    const result = await this.call(
      "POST",
      "/v1/auth/app/redeem",
      authResponseSchema.or(twoFactorChallengeSchema),
      { code, secret },
      { authed: false, headers: deviceHeaders(device) },
    );
    if ("twoFactorRequired" in result) {
      throw new TwoFactorRequiredError(result.challenge, result.methods);
    }
    await this.adopt(result.token);
    return this.me();
  }

  /// Confirms it is the person on this device, which changes to how the account signs in
  /// need. Good for ten minutes. Without a password, a provider confirmation made just
  /// before (`finishConfirmation`) stands in for it.
  recheck(input: Recheck): Promise<void> {
    const given = Object.entries(input).filter(([, value]) => value !== undefined);
    return this.callVoid("POST", "/v1/account/recheck", Object.fromEntries(given));
  }

  /// Emails the code that answers the second step of a recheck.
  sendRecheckCode(): Promise<void> {
    return this.callVoid("POST", "/v1/account/recheck/email", {});
  }

  /// The ways this account signs in.
  signInMethods(): Promise<SignInSummary> {
    return this.call("GET", "/v1/account/sign-in", signInSummarySchema);
  }

  /// Begins connecting a provider to the signed in account.
  beginLink(input: { provider: string; port?: number }) {
    return this.call("POST", "/v1/account/sign-in/link/begin", providerBeginResponseSchema, input);
  }

  /// Swaps the code the browser brought back for the connected provider.
  finishLink(code: string, secret: string): Promise<SignInChange> {
    return this.signInChange("POST", "/v1/account/sign-in/link/redeem", { code, secret });
  }

  /// Disconnects a way of signing in. Devices that signed in with it are signed out.
  unlink(provider: string): Promise<SignInChange> {
    return this.signInChange("DELETE", `/v1/account/sign-in/${encodeURIComponent(provider)}`);
  }

  setPrimary(provider: string): Promise<SignInChange> {
    return this.signInChange("POST", "/v1/account/sign-in/primary", { provider });
  }

  /// Emails a code to a new address, to change a way of signing in to it (or, for an account
  /// without Nookly Signin, to add that with it).
  sendEmailCode(provider: string, email: string): Promise<void> {
    return this.callVoid("POST", "/v1/account/sign-in/email/code", {
      provider,
      email: email.trim().toLowerCase(),
    });
  }

  changeEmail(provider: string, email: string, code: string): Promise<SignInChange> {
    return this.signInChange("POST", "/v1/account/sign-in/email", {
      provider,
      email: email.trim().toLowerCase(),
      code: code.trim(),
    });
  }

  /// Adds Nookly Signin: an email, confirmed by the code sent to it, and a password.
  addPassword(email: string, code: string, password: string): Promise<SignInChange> {
    return this.signInChange("POST", "/v1/account/sign-in/password", {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      password,
    });
  }

  /// A new Nookly Signin password, without the old one: the recheck stands in for it.
  setPassword(password: string): Promise<SignInChange> {
    return this.signInChange("POST", "/v1/account/sign-in/password/change", { password });
  }

  private async signInChange(method: string, path: string, body?: Body): Promise<SignInChange> {
    const change = await this.call(method, path, signInChangeSchema, body);
    if (change.signedOut) {
      await this.forget();
      this.onSignedOut?.();
    }
    return change;
  }

  /// Picks the username of an account made with a provider. It can only be done once.
  setUsername(username: string): Promise<User> {
    return this.call("POST", "/v1/account/username", userSchema, { username: username.trim() });
  }

  /// Creates an account and signs this device in.
  async signUp(input: SignUp, device: DeviceInfo): Promise<User> {
    const username = input.username.trim();
    const email = input.email?.trim();
    const betaKey = input.betaKey?.trim();
    const fields = { username, name: username, password: input.password, callbackURL: "/verified" };
    // Only what was given goes in the body.
    const given = Object.entries({ email, betaKey }).filter(([, value]) => value);
    const body = { ...fields, ...Object.fromEntries(given) };
    const result = await this.call("POST", "/v1/auth/sign-up/email", authResponseSchema, body, {
      authed: false,
      headers: deviceHeaders(device),
    });
    await this.adopt(result.token);
    if (input.termsVersion) return this.acceptTerms(input.termsVersion);
    return this.me();
  }

  /// Records that the account agreed to this version of the terms.
  acceptTerms(version: string): Promise<User> {
    return this.call("POST", "/v1/account/terms", userSchema, { version });
  }

  /// Signs this device in with a username or an email address. An account with two-factor
  /// is not signed in yet: this throws `TwoFactorRequiredError` and `verifyTwoFactor` finishes.
  async signIn(identifier: string, password: string, device: DeviceInfo): Promise<User> {
    const id = identifier.trim();
    const byEmail = id.includes("@");
    const result = await this.call(
      "POST",
      byEmail ? "/v1/auth/sign-in/email" : "/v1/auth/sign-in/username",
      authResponseSchema.or(twoFactorChallengeSchema),
      byEmail ? { email: id.toLowerCase(), password } : { username: id, password },
      { authed: false, headers: deviceHeaders(device) },
    );
    if ("twoFactorRequired" in result) {
      throw new TwoFactorRequiredError(result.challenge, result.methods);
    }
    await this.adopt(result.token);
    return this.me();
  }

  /// Emails the account a sign in code, for a challenge that offers `email`.
  async sendTwoFactorEmail(challenge: string): Promise<void> {
    await this.callVoid(
      "POST",
      "/v1/auth/two-factor/send-otp",
      {},
      {
        authed: false,
        headers: { [CHALLENGE_HEADER]: challenge },
      },
    );
  }

  /// The second step of a sign in: the code, from the method the person chose.
  async verifyTwoFactor(
    challenge: string,
    method: TwoFactorMethod,
    code: string,
    device: DeviceInfo,
  ): Promise<User> {
    const path = {
      totp: "/v1/auth/two-factor/verify-totp",
      email: "/v1/auth/two-factor/verify-otp",
      backup: "/v1/auth/two-factor/verify-backup-code",
    }[method];
    const result = await this.call(
      "POST",
      path,
      authResponseSchema,
      { code: code.trim() },
      {
        authed: false,
        headers: { ...deviceHeaders(device), [CHALLENGE_HEADER]: challenge },
      },
    );
    await this.adopt(result.token);
    return this.me();
  }

  /// What this account has for two-factor.
  security(): Promise<SecuritySummary> {
    return this.call("GET", "/v1/account/security", securitySummarySchema);
  }

  /// Gives an account made without an email one, which is then sent a confirmation link.
  addEmail(email: string): Promise<User> {
    return this.call("POST", "/v1/account/email", userSchema, { email: email.trim() });
  }

  /// Turns on emailed codes. The account needs a confirmed email, and a recheck.
  enableEmailTwoFactor(): Promise<SecuritySummary> {
    return this.call("POST", "/v1/account/two-factor/email", securitySummarySchema, {});
  }

  /// Starts adding an authenticator app: nothing is on until `confirmAuthenticator`.
  startAuthenticator(): Promise<AuthenticatorStart> {
    return this.call("POST", "/v1/account/two-factor/authenticator", authenticatorStartSchema, {});
  }

  /// A code from the new authenticator app turns it on. The recovery codes come back once.
  confirmAuthenticator(code: string): Promise<string[]> {
    return this.call("POST", "/v1/account/two-factor/authenticator/confirm", backupCodesSchema, {
      code: code.trim(),
    }).then((result) => result.backupCodes);
  }

  /// Turns a method off.
  disableTwoFactor(method: "email" | "totp"): Promise<SecuritySummary> {
    return this.call("POST", "/v1/account/two-factor/disable", securitySummarySchema, { method });
  }

  /// Replaces the recovery codes with new ones, which come back once.
  newBackupCodes(): Promise<string[]> {
    return this.call("POST", "/v1/account/two-factor/backup-codes", backupCodesSchema, {}).then(
      (result) => result.backupCodes,
    );
  }

  async signOut(): Promise<void> {
    const token = await this.sessionToken();
    try {
      if (token) await this.callVoid("POST", "/v1/auth/sign-out", {});
    } finally {
      // Only this session's token: a sign in that finished meanwhile keeps its own.
      const current = await this.store.load();
      if (current === null || current === token) await this.forget();
      else this.token = null;
    }
  }

  me(): Promise<User> {
    return this.call("GET", "/v1/account", userSchema);
  }

  async deleteAccount(password?: string): Promise<void> {
    await this.callVoid("DELETE", "/v1/account", password === undefined ? {} : { password });
    await this.forget();
  }

  /// Emails a reset link when the address belongs to an account. Looks the same
  /// either way, so it can't tell which addresses have accounts.
  forgotPassword(email: string): Promise<void> {
    return this.callVoid(
      "POST",
      "/v1/auth/request-password-reset",
      { email: email.trim().toLowerCase(), redirectTo: "/reset-password" },
      { authed: false },
    );
  }

  resetPassword(token: string, password: string): Promise<void> {
    return this.callVoid(
      "POST",
      "/v1/auth/reset-password",
      { token, newPassword: password },
      { authed: false },
    );
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.callVoid("POST", "/v1/auth/change-password", {
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });
  }

  /// Sends the confirmation email again.
  resendVerification(email: string): Promise<void> {
    return this.callVoid("POST", "/v1/auth/send-verification-email", {
      email,
      callbackURL: "/verified",
    });
  }

  async sessions(): Promise<Session[]> {
    return (await this.call("GET", "/v1/sessions", sessionsResponseSchema)).sessions;
  }

  revokeSession(id: string): Promise<void> {
    return this.callVoid("DELETE", `/v1/sessions/${encodeURIComponent(id)}`);
  }

  /// Shares an item with someone by username, or by email address.
  share(entityId: string, recipient: string, role: ShareRole) {
    return this.call("POST", "/v1/shares", createShareResponseSchema, {
      entityId,
      recipient,
      role,
    });
  }

  async sharesByMe(): Promise<Share[]> {
    return (await this.call("GET", "/v1/shares/outgoing", sharesResponseSchema)).shares;
  }

  async sharesWithMe(): Promise<Share[]> {
    return (await this.call("GET", "/v1/shares/incoming", sharesResponseSchema)).shares;
  }

  acceptShare(id: string): Promise<void> {
    return this.callVoid("POST", `/v1/shares/${encodeURIComponent(id)}/accept`);
  }

  declineShare(id: string): Promise<void> {
    return this.callVoid("POST", `/v1/shares/${encodeURIComponent(id)}/decline`);
  }

  acceptInvite(token: string): Promise<void> {
    return this.callVoid("POST", "/v1/invites/accept", { token });
  }

  changeShareRole(id: string, role: ShareRole): Promise<void> {
    return this.callVoid("PATCH", `/v1/shares/${encodeURIComponent(id)}`, { role });
  }

  /// Revokes a share as its owner, or leaves it as its recipient.
  removeShare(id: string): Promise<void> {
    return this.callVoid("DELETE", `/v1/shares/${encodeURIComponent(id)}`);
  }

  /// A raw request with the session token, for file contents.
  private async raw(method: string, path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.sessionToken();
    if (!token) throw new ApiRequestError(401, "unauthorized", "Sign in first.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await this.fetchImpl(apiUrl(this.baseUrl, path), {
        ...init,
        method,
        headers,
        credentials: "omit",
      });
    } catch (error) {
      throw NetworkError.unreachable(error);
    }
    if (response.status === 401) await this.ended(token);
    return response;
  }

  private async failed(response: Response): Promise<never> {
    throw await requestError(response, null);
  }

  /// Whether the server already holds this file's contents.
  async hasBlob(sha256: string): Promise<boolean> {
    const response = await this.raw("HEAD", `/v1/blobs/${sha256}`);
    if (response.status === 404) return false;
    if (!response.ok) return this.failed(response);
    return true;
  }

  /// Sends a file's contents. The server checks them against `sha256` and keeps
  /// nothing that doesn't match, so sending again is always safe.
  async uploadBlob(sha256: string, body: BodyInit, contentType: string): Promise<void> {
    const response = await this.raw("PUT", `/v1/blobs/${sha256}`, {
      body,
      headers: { "content-type": contentType },
    });
    if (!response.ok) await this.failed(response);
  }

  async downloadBlob(sha256: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const response = await this.raw("GET", `/v1/blobs/${sha256}`);
    if (!response.ok) return this.failed(response);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  push(request: PushRequest): Promise<PushResponse> {
    return this.call("POST", "/v1/sync/push", pushResponseSchema, request);
  }

  /// Conflicts nobody decided on yet, the account's whole history of them.
  async conflicts(): Promise<ServerConflict[]> {
    return (await this.call("GET", "/v1/conflicts", serverConflictsSchema)).conflicts;
  }

  /// Hands a clash only this device saw to the server, so every device offers it.
  reportConflict(report: ConflictReport): Promise<ConflictReported> {
    return this.call("POST", "/v1/conflicts", conflictReportedSchema, report);
  }

  resolveConflict(id: string): Promise<void> {
    return this.callVoid("POST", `/v1/conflicts/${encodeURIComponent(id)}/resolve`);
  }

  /// The account's devices, to name the device behind a clock.
  async devices(): Promise<DeviceName[]> {
    return (await this.call("GET", "/v1/devices", devicesSchema)).devices;
  }

  /// The keys of `pks` in `table` the server has no record of.
  async missing(table: string, pks: string[]): Promise<string[]> {
    return (await this.call("POST", "/v1/sync/missing", missingResponseSchema, { table, pks }))
      .missing;
  }

  pull(request: PullRequest): Promise<PullResponse> {
    return this.call("POST", "/v1/sync/pull", pullResponseSchema, request);
  }

  /// The sync engine's way to the server: pushes and pulls over HTTP, and a
  /// WebSocket that says when there is something new.
  syncTransport(): SyncTransport {
    return {
      push: (request) => this.push(request),
      pull: (request) => this.pull(request),
      live: (handlers) => this.live(handlers),
    };
  }

  private live(handlers: LiveHandlers): () => void {
    const url = `${this.baseUrl.replace(/^http/, "ws")}/v1/sync/ws`;
    let socket: LiveSocket | null = null;
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let opening: ReturnType<typeof setTimeout> | null = null;
    const stopTimers = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (opening) clearTimeout(opening);
      heartbeat = opening = null;
    };
    // Told once whichever way the connection ends, by the server or by us. Whatever kept it
    // from starting counts too, so the sync client tries again.
    const ended = () => {
      stopTimers();
      if (closed) return;
      closed = true;
      handlers.onClose();
    };
    void (async () => {
      const token = await this.sessionToken().catch(() => null);
      if (closed) return;
      if (!token) return ended();
      try {
        socket = this.webSocket(url);
      } catch {
        return ended();
      }
      opening = setTimeout(() => {
        socket?.close();
        ended();
      }, LIVE_CONNECT_MS);
      let heardAt = Date.now();
      socket.addEventListener("open", () => {
        heardAt = Date.now();
        socket?.send(JSON.stringify({ type: "hello", token }));
        // Keeps proxies from closing a quiet connection, and tells a dead one from a
        // quiet one: the server answers every ping, so silence means it is gone (a
        // server that vanished or a network that changed leaves no close event).
        heartbeat = setInterval(() => {
          if (Date.now() - heardAt > LIVE_SILENCE_MS) {
            socket?.close();
            ended();
            return;
          }
          socket?.send(JSON.stringify({ type: "ping" }));
        }, LIVE_PING_MS);
      });
      socket.addEventListener("message", (event) => {
        heardAt = Date.now();
        let message: ServerMessage;
        try {
          message = serverMessageSchema.parse(JSON.parse(String(event.data)));
        } catch {
          return;
        }
        if (message.type === "ready") {
          if (opening) clearTimeout(opening);
          opening = null;
          handlers.onOpen();
        } else if (message.type === "changes" || message.type === "datasets") handlers.onChanges();
        else if (message.type === "account") handlers.onAccount?.();
        else if (message.type === "error" && message.code === "unauthorized") {
          // The session ended on the server: this device is signed out.
          void this.ended(token);
        }
      });
      socket.addEventListener("close", ended);
    })();
    return () => {
      closed = true;
      stopTimers();
      socket?.close();
    };
  }
}
