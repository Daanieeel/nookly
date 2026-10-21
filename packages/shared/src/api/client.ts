import type { z } from "zod";
import {
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type DeviceName,
  type ServerConflict,
  type ServerMessage,
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
  type Session,
  type Share,
  type ShareRole,
  type SignUp,
  type User,
  authResponseSchema,
  createShareResponseSchema,
  healthSchema,
  providersResponseSchema,
  sessionsResponseSchema,
  sharesResponseSchema,
  userSchema,
} from "./schemas.ts";
import { z as zod } from "zod";

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

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/// `fetch`, as far as the client uses it.
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/// How often the live channel pings, and how long without hearing anything it takes
/// for dead.
const LIVE_PING_MS = 15_000;
const LIVE_SILENCE_MS = 40_000;

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
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        // The token is the credential; a cookie jar's leftovers must not ride along.
        credentials: "omit",
      });
    } catch (error) {
      throw NetworkError.unreachable(error);
    }
    if (authed && response.status === 401) {
      await this.forget();
      this.onSignedOut?.();
    }
    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
      const data = parsed.success ? parsed.data : {};
      const code = (data.error ?? data.code ?? "http_error").toLowerCase();
      throw new ApiRequestError(
        response.status,
        code,
        FRIENDLY.get(code) ?? data.message ?? `Request failed (${response.status})`,
      );
    }
    if (!schema) return null;
    return schema.parse(await response.json());
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
    options?: { authed?: boolean },
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

  /// Creates an account and signs this device in.
  async signUp(input: SignUp, device: DeviceInfo): Promise<User> {
    const username = input.username.trim();
    const email = input.email?.trim();
    const fields = { username, name: username, password: input.password, callbackURL: "/verified" };
    const body = email ? { ...fields, email } : fields;
    const result = await this.call("POST", "/v1/auth/sign-up/email", authResponseSchema, body, {
      authed: false,
      headers: deviceHeaders(device),
    });
    await this.adopt(result.token);
    return this.me();
  }

  /// Signs this device in with a username or an email address.
  async signIn(identifier: string, password: string, device: DeviceInfo): Promise<User> {
    const id = identifier.trim();
    const byEmail = id.includes("@");
    const result = await this.call(
      "POST",
      byEmail ? "/v1/auth/sign-in/email" : "/v1/auth/sign-in/username",
      authResponseSchema,
      byEmail ? { email: id.toLowerCase(), password } : { username: id, password },
      { authed: false, headers: deviceHeaders(device) },
    );
    await this.adopt(result.token);
    return this.me();
  }

  async signOut(): Promise<void> {
    try {
      if (await this.sessionToken()) await this.callVoid("POST", "/v1/auth/sign-out", {});
    } finally {
      await this.forget();
    }
  }

  me(): Promise<User> {
    return this.call("GET", "/v1/account", userSchema);
  }

  async deleteAccount(password: string): Promise<void> {
    await this.callVoid("DELETE", "/v1/account", { password });
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
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        method,
        headers,
        credentials: "omit",
      });
    } catch (error) {
      throw NetworkError.unreachable(error);
    }
    if (response.status === 401) {
      await this.forget();
      this.onSignedOut?.();
    }
    return response;
  }

  private async failed(response: Response): Promise<never> {
    const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
    const data = parsed.success ? parsed.data : {};
    const code = (data.error ?? data.code ?? "http_error").toLowerCase();
    throw new ApiRequestError(
      response.status,
      code,
      data.message ?? `Request failed (${response.status})`,
    );
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
    // Told once whichever way the connection ends, by the server or by us.
    const ended = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (closed) return;
      closed = true;
      handlers.onClose();
    };
    void (async () => {
      const token = await this.sessionToken();
      if (closed || !token) return;
      socket = this.webSocket(url);
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
        if (message.type === "ready") handlers.onOpen();
        else if (message.type === "changes" || message.type === "datasets") handlers.onChanges();
        else if (message.type === "error" && message.code === "unauthorized") {
          // The session ended on the server: this device is signed out.
          void this.forget().then(() => this.onSignedOut?.());
        }
      });
      socket.addEventListener("close", ended);
    })();
    return () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      socket?.close();
    };
  }
}
