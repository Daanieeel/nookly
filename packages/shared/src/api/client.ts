import type { z } from "zod";
import {
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ServerMessage,
  pullResponseSchema,
  pushResponseSchema,
  serverMessageSchema,
} from "../sync/protocol.ts";
import { type LiveHandlers, NetworkError, type SyncTransport } from "../sync/client.ts";
import {
  type AuthResponse,
  type DeviceInfo,
  type Session,
  type Share,
  type ShareRole,
  type Tokens,
  type User,
  apiErrorSchema,
  authResponseSchema,
  createShareResponseSchema,
  healthSchema,
  sessionsResponseSchema,
  sharesResponseSchema,
  tokensSchema,
  userSchema,
} from "./schemas.ts";

/// Where a client keeps its refresh token: the desktop's keychain, the phone's
/// secure store. The access token only ever lives in memory.
export interface TokenStore {
  load(): Promise<string | null>;
  save(refreshToken: string | null): Promise<void>;
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

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: FetchLike;
  /// Builds the live sync socket; defaults to the global `WebSocket`.
  webSocket?: (url: string) => WebSocket;
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
/// requests with the access token and renews it with the refresh token when it runs
/// out, once per request.
export class ApiClient {
  readonly baseUrl: string;
  private readonly store: TokenStore;
  private readonly fetchImpl: FetchLike;
  private readonly webSocket: (url: string) => WebSocket;
  private readonly onSignedOut?: () => void;
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.store = options.tokens;
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.webSocket = options.webSocket ?? ((url) => new WebSocket(url));
    this.onSignedOut = options.onSignedOut;
  }

  private async send<T>(
    method: string,
    path: string,
    schema: z.ZodType<T> | null,
    body?: Body,
    authed = true,
  ): Promise<T | null> {
    const attempt = async () => {
      const headers: Record<string, string> = body ? { ...JSON_HEADERS } : {};
      if (authed && this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
      try {
        return await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        throw new NetworkError(error instanceof Error ? error.message : "Network error");
      }
    };
    if (authed && !this.accessToken) await this.refresh();
    let response = await attempt();
    if (authed && response.status === 401 && (await this.refresh())) response = await attempt();
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
      throw new ApiRequestError(
        response.status,
        parsed.success ? parsed.data.error : "http_error",
        parsed.success ? parsed.data.message : `Request failed (${response.status})`,
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
    authed = true,
  ): Promise<T> {
    const result = await this.send(method, path, schema, body, authed);
    if (result === null) throw new Error("Empty response");
    return result;
  }

  private async callVoid(method: string, path: string, body?: Body, authed = true): Promise<void> {
    await this.send(method, path, null, body, authed);
  }

  /// Renews the access token. Signs out when the refresh token is no good anymore.
  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      try {
        const refreshToken = await this.store.load();
        if (!refreshToken) return false;
        const response = await this.fetchImpl(`${this.baseUrl}/v1/auth/refresh`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ refreshToken }),
        }).catch((error: Error) => {
          throw new NetworkError(error.message);
        });
        if (response.status === 401) {
          await this.forget();
          this.onSignedOut?.();
          return false;
        }
        if (!response.ok) return false;
        await this.adopt(tokensSchema.parse(await response.json()));
        return true;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async adopt(tokens: Tokens) {
    this.accessToken = tokens.accessToken;
    await this.store.save(tokens.refreshToken);
  }

  private async forget() {
    this.accessToken = null;
    await this.store.save(null);
  }

  async isSignedIn(): Promise<boolean> {
    return this.accessToken !== null || (await this.store.load()) !== null;
  }

  async health(): Promise<{ status: "ok"; version: string }> {
    return this.call("GET", "/health", healthSchema, undefined, false);
  }

  async register(email: string, password: string, device: DeviceInfo): Promise<User> {
    const result = await this.call(
      "POST",
      "/v1/auth/register",
      authResponseSchema,
      { email, password, device },
      false,
    );
    await this.adopt(result.tokens);
    return result.user;
  }

  async signIn(email: string, password: string, device: DeviceInfo): Promise<User> {
    const result: AuthResponse = await this.call(
      "POST",
      "/v1/auth/login",
      authResponseSchema,
      { email, password, device },
      false,
    );
    await this.adopt(result.tokens);
    return result.user;
  }

  async signOut(): Promise<void> {
    try {
      await this.callVoid("POST", "/v1/auth/logout");
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

  verifyEmail(token: string): Promise<void> {
    return this.callVoid("POST", "/v1/auth/verify-email", { token }, false);
  }

  resendVerification(): Promise<void> {
    return this.callVoid("POST", "/v1/auth/resend-verification");
  }

  forgotPassword(email: string): Promise<void> {
    return this.callVoid("POST", "/v1/auth/forgot-password", { email }, false);
  }

  resetPassword(token: string, password: string): Promise<void> {
    return this.callVoid("POST", "/v1/auth/reset-password", { token, password }, false);
  }

  async sessions(): Promise<Session[]> {
    return (await this.call("GET", "/v1/sessions", sessionsResponseSchema)).sessions;
  }

  revokeSession(id: string): Promise<void> {
    return this.callVoid("DELETE", `/v1/sessions/${encodeURIComponent(id)}`);
  }

  share(entityId: string, email: string, role: ShareRole) {
    return this.call("POST", "/v1/shares", createShareResponseSchema, { entityId, email, role });
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

  push(request: PushRequest): Promise<PushResponse> {
    return this.call("POST", "/v1/sync/push", pushResponseSchema, request);
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
    let socket: WebSocket | null = null;
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      if (!this.accessToken) await this.refresh().catch(() => false);
      if (closed) return;
      socket = this.webSocket(url);
      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({ type: "hello", token: this.accessToken ?? "" }));
        // Keeps proxies from closing a quiet connection.
        heartbeat = setInterval(() => socket?.send(JSON.stringify({ type: "ping" })), 25_000);
      });
      socket.addEventListener("message", (event) => {
        let message: ServerMessage;
        try {
          message = serverMessageSchema.parse(JSON.parse(String(event.data)));
        } catch {
          return;
        }
        if (message.type === "ready") handlers.onOpen();
        else if (message.type === "changes" || message.type === "datasets") handlers.onChanges();
        else if (message.type === "error" && message.code === "unauthorized") {
          void this.refresh();
        }
      });
      socket.addEventListener("close", () => {
        if (heartbeat) clearInterval(heartbeat);
        if (!closed) handlers.onClose();
      });
    })();
    return () => {
      closed = true;
      socket?.close();
    };
  }
}
