import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import {
  createShareRequestSchema,
  deleteAccountRequestSchema,
  resetPasswordRequestSchema,
  tokenRequestSchema,
  updateShareRequestSchema,
} from "@nookly/shared/api";
import {
  clientMessageSchema,
  missingRequestSchema,
  pullRequestSchema,
  pushRequestSchema,
} from "@nookly/shared/sync";
import { Elysia } from "elysia";
import { z } from "zod";
import { AccountService } from "./auth/accounts.ts";
import { createAuth, socialProviders } from "./auth/auth.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/client.ts";
import { HttpError } from "./errors.ts";
import type { Logger } from "./log.ts";
import type { Mailer } from "./mail/mailer.ts";
import { invitePage, resetPasswordPage, resultPage } from "./pages.ts";
import { RateLimiter } from "./security/rate-limit.ts";
import { ShareService } from "./shares/service.ts";
import { Hub, type LiveSocket } from "./sync/hub.ts";
import { SyncService } from "./sync/service.ts";
import { type BlobStore, SHA256_PATTERN } from "./storage/blobs.ts";

export interface AppDeps {
  config: Config;
  db: Database;
  mailer: Mailer;
  log: Logger;
  /// File storage; null when no S3 is configured (files then stay on each device).
  storage?: BlobStore | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/// How long a fresh WebSocket has to sign in before it is closed.
const HELLO_TIMEOUT_MS = 10_000;

const idParams = z.object({ id: z.uuid() });
const blobParams = z.object({ sha256: z.string().regex(SHA256_PATTERN) });
/// What a stored file may say it is; anything else is stored as plain bytes.
const contentTypeOf = (header: string | null) =>
  header && /^[\w.+-]+\/[\w.+-]+$/.test(header.split(";")[0].trim())
    ? header.split(";")[0].trim()
    : "application/octet-stream";
const tokenQuery = z.object({ token: z.string().min(10).max(512) });
const resetForm = z.object({ token: z.string().min(10).max(512), password: z.string().max(512) });
/// better-auth's routes that check a password or send mail, limited per address.
const SIGN_IN_PATHS = new Set(["/v1/auth/sign-in/email", "/v1/auth/sign-in/username"]);
const MAIL_PATHS = new Set([
  "/v1/auth/request-password-reset",
  "/v1/auth/send-verification-email",
  "/v1/auth/reset-password",
]);

export function buildApp({ config, db, mailer, log, storage = null }: AppDeps) {
  const hub = new Hub();
  const auth = createAuth(db, config, mailer, log);
  const accounts = new AccountService(db, auth, storage);
  const providers = Object.keys(socialProviders(config));
  const sync = new SyncService(db, hub, log);
  const sharing = new ShareService(db, sync, hub, mailer, config, log);

  const scale = config.RATE_LIMIT_SCALE;
  const limits = {
    signIn: new RateLimiter(10 * scale, 15 * MINUTE),
    register: new RateLimiter(10 * scale, HOUR),
    email: new RateLimiter(5 * scale, HOUR),
    refresh: new RateLimiter(60 * scale, MINUTE),
    sync: new RateLimiter(600 * scale, MINUTE),
    share: new RateLimiter(60 * scale, HOUR),
    socket: new RateLimiter(60 * scale, MINUTE),
  };

  function limit(limiter: RateLimiter, key: string) {
    const wait = limiter.take(key);
    if (wait !== null) {
      throw new HttpError(429, "rate_limited", `Too many requests. Try again in ${wait} seconds.`);
    }
  }

  const claimsOf = (headers: Record<string, string | undefined>) => accounts.fromHeaders(headers);

  const sockets = new Map<
    string,
    { userId: string | null; socket: LiveSocket; timer: ReturnType<typeof setTimeout> }
  >();

  function files(): BlobStore {
    if (!storage) {
      throw new HttpError(
        503,
        "no_storage",
        "This server doesn't store files. Files stay on each device.",
      );
    }
    return storage;
  }

  const app = new Elysia({
    // File uploads stream up to MAX_BLOB_BYTES; everything else is held to
    // MAX_BODY_BYTES by `onRequest` below.
    serve: { maxRequestBodySize: Math.max(config.MAX_BODY_BYTES, config.MAX_BLOB_BYTES) + 1024 },
  })
    .onRequest(({ request, set }) => {
      if (new URL(request.url).pathname.startsWith("/v1/blobs/")) return;
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > config.MAX_BODY_BYTES) {
        set.status = 413;
        return { error: "too_large", message: "The request is too large." };
      }
    })
    .use(
      cors({
        // Browsers only: the apps' own requests carry no origin. Anything else is refused.
        origin: (request) => {
          const origin = request.headers.get("origin");
          return origin === null || config.corsOrigins.includes(origin);
        },
        allowedHeaders: [
          "content-type",
          "authorization",
          "x-nookly-device-name",
          "x-nookly-platform",
        ],
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
        exposeHeaders: ["set-auth-token"],
        credentials: false,
        maxAge: 600,
      }),
    )
    .use(
      openapi({
        path: "/docs",
        mapJsonSchema: { zod: z.toJSONSchema },
        documentation: {
          info: { title: "Nookly sync server", version: config.version },
          components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
        },
      }),
    )
    .derive(({ request, server }) => {
      const forwarded = config.TRUST_PROXY
        ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        : undefined;
      return {
        ip: forwarded || server?.requestIP(request)?.address || "unknown",
        started: performance.now(),
      };
    })
    .onError(({ code, error, set }) => {
      if (error instanceof HttpError) {
        set.status = error.status;
        return { error: error.code, message: error.message };
      }
      if (code === "VALIDATION") {
        set.status = 422;
        return { error: "invalid_request", message: "Some of the request is missing or invalid." };
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "not_found", message: "Not found." };
      }
      if (code === "PARSE") {
        set.status = 400;
        return { error: "invalid_body", message: "The request body couldn't be read." };
      }
      log.error("unhandled error", {
        code: String(code),
        error: error instanceof Error ? error.message : String(error),
      });
      set.status = 500;
      return { error: "internal", message: "Something went wrong on the server." };
    })
    .onAfterResponse(({ request, set, started }) => {
      // The path only: query strings can hold tokens (email links).
      log.info("request", {
        method: request.method,
        path: new URL(request.url).pathname,
        status: Number(set.status ?? 200),
        ms: Math.round(performance.now() - (started ?? performance.now())),
      });
    })
    .get(
      "/health",
      async ({ set }) => {
        try {
          await db.execute("select 1");
          return { status: "ok" as const, version: config.version };
        } catch {
          set.status = 503;
          return { error: "unavailable", message: "The database can't be reached." };
        }
      },
      { detail: { summary: "Health check", tags: ["Server"] } },
    )
    // Pages the links in emails open.
    .get(
      "/verified",
      ({ query, set }) => {
        set.headers["content-type"] = "text/html; charset=utf-8";
        if (query.error) {
          set.status = 400;
          return resultPage(
            "This link doesn't work",
            "It has expired or was already used. Ask Nookly for a new one in Settings.",
          );
        }
        return resultPage("Email confirmed", "You can go back to Nookly.");
      },
      { query: z.object({ error: z.string().max(100).optional() }), detail: { hide: true } },
    )
    .get(
      "/reset-password",
      ({ query, set }) => {
        set.headers["content-type"] = "text/html; charset=utf-8";
        return resetPasswordPage(query.token);
      },
      { query: tokenQuery, detail: { hide: true } },
    )
    .post(
      "/reset-password",
      async ({ body, set, ip }) => {
        limit(limits.email, `reset:${ip}`);
        set.headers["content-type"] = "text/html; charset=utf-8";
        const parsed = resetPasswordRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return resetPasswordPage(body.token, "Use at least 10 characters.");
        }
        try {
          await auth.api.resetPassword({
            body: { token: parsed.data.token, newPassword: parsed.data.password },
          });
          return resultPage(
            "Password changed",
            "Sign in to Nookly with your new password. Every device was signed out.",
          );
        } catch {
          set.status = 400;
          return resultPage(
            "This link doesn't work",
            "It has expired or was already used. Ask for a new one.",
          );
        }
      },
      { body: resetForm, detail: { hide: true } },
    )
    .get(
      "/invite",
      ({ set }) => {
        set.headers["content-type"] = "text/html; charset=utf-8";
        return invitePage();
      },
      { query: tokenQuery, detail: { hide: true } },
    )
    .group("/v1", (v1) =>
      v1
        .get("/auth/providers", () => ({ providers }), {
          detail: { summary: "Sign in providers besides username and password", tags: ["Auth"] },
        })
        // Everything else under /v1/auth is better-auth: sign up and in (username or
        // email), sign out, sessions, password reset, email verification, OAuth.
        .all(
          "/auth/*",
          ({ request, ip }) => {
            const path = new URL(request.url).pathname;
            if (request.method === "POST" && SIGN_IN_PATHS.has(path))
              limit(limits.signIn, `login:${ip}`);
            if (request.method === "POST" && path === "/v1/auth/sign-up/email") {
              limit(limits.register, `register:${ip}`);
            }
            if (request.method === "POST" && MAIL_PATHS.has(path))
              limit(limits.email, `mail:${ip}`);
            return auth.handler(request);
          },
          { parse: "none", detail: { hide: true } },
        )
        .get("/account", async ({ headers }) => accounts.me((await claimsOf(headers)).userId), {
          detail: {
            summary: "The signed in account",
            tags: ["Account"],
            security: [{ bearer: [] }],
          },
        })
        .delete(
          "/account",
          async ({ headers, body, set }) => {
            await accounts.deleteAccount(await claimsOf(headers), body.password);
            set.status = 204;
          },
          {
            body: deleteAccountRequestSchema,
            detail: {
              summary: "Delete the account and all its data on the server",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .get(
          "/sessions",
          async ({ headers }) => ({ sessions: await accounts.sessions(await claimsOf(headers)) }),
          {
            detail: { summary: "Devices signed in", tags: ["Account"], security: [{ bearer: [] }] },
          },
        )
        .delete(
          "/sessions/:id",
          async ({ headers, params, set }) => {
            await accounts.revokeSession(await claimsOf(headers), params.id);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Sign a device out", tags: ["Account"], security: [{ bearer: [] }] },
          },
        )
        .put(
          "/blobs/:sha256",
          async ({ headers, params, request, set }) => {
            const claims = await claimsOf(headers);
            limit(limits.sync, `sync:${claims.userId}`);
            const store = files();
            const length = Number(request.headers.get("content-length") ?? 0);
            if (length > config.MAX_BLOB_BYTES) {
              throw new HttpError(413, "too_large", "This file is larger than the server allows.");
            }
            if (!request.body) throw new HttpError(400, "invalid_body", "The file is empty.");
            const outcome = await store.put(
              claims.userId,
              params.sha256,
              request.body,
              contentTypeOf(request.headers.get("content-type")),
            );
            set.status = outcome === "created" ? 201 : 200;
            return { sha256: params.sha256, stored: true };
          },
          {
            parse: "none",
            params: blobParams,
            detail: {
              summary: "Store a file's contents under its SHA-256",
              tags: ["Files"],
              security: [{ bearer: [] }],
            },
          },
        )
        .head(
          "/blobs/:sha256",
          async ({ headers, params, set }) => {
            const claims = await claimsOf(headers);
            set.status = (await files().exists(claims.userId, params.sha256)) ? 200 : 404;
            return "";
          },
          { params: blobParams, detail: { hide: true } },
        )
        .get(
          "/blobs/:sha256",
          async ({ headers, params }) => {
            const claims = await claimsOf(headers);
            limit(limits.sync, `sync:${claims.userId}`);
            const blob = await files().get(claims.userId, params.sha256);
            if (!blob) throw new HttpError(404, "not_found", "This file isn't on the server.");
            return new Response(blob.body, {
              headers: {
                "content-type": blob.contentType,
                "content-length": String(blob.size),
                etag: `"${params.sha256}"`,
                "cache-control": "private, max-age=31536000, immutable",
              },
            });
          },
          {
            params: blobParams,
            detail: {
              summary: "Read a file's contents",
              tags: ["Files"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/sync/push",
          async ({ headers, body }) => {
            const claims = await claimsOf(headers);
            limit(limits.sync, `sync:${claims.userId}`);
            return { results: await sync.push(claims.userId, body.changes) };
          },
          {
            body: pushRequestSchema,
            detail: { summary: "Send local changes", tags: ["Sync"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/sync/pull",
          async ({ headers, body }) => {
            const claims = await claimsOf(headers);
            limit(limits.sync, `sync:${claims.userId}`);
            return sync.pull(claims.userId, body);
          },
          {
            body: pullRequestSchema,
            detail: {
              summary: "Fetch changes since a cursor",
              tags: ["Sync"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/sync/missing",
          async ({ headers, body }) => {
            const claims = await claimsOf(headers);
            limit(limits.sync, `sync:${claims.userId}`);
            return { missing: await sync.missing(claims.userId, body.table, body.pks) };
          },
          {
            body: missingRequestSchema,
            detail: {
              summary: "Which of these rows the server doesn't have",
              tags: ["Sync"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/shares",
          async ({ headers, body, set }) => {
            const claims = await claimsOf(headers);
            limit(limits.share, `share:${claims.userId}`);
            set.status = 201;
            return sharing.create(claims.userId, body.entityId, body.recipient, body.role);
          },
          {
            body: createShareRequestSchema,
            detail: {
              summary: "Share an item by username or email",
              tags: ["Sharing"],
              security: [{ bearer: [] }],
            },
          },
        )
        .get(
          "/shares/outgoing",
          async ({ headers }) => ({
            shares: await sharing.outgoing((await claimsOf(headers)).userId),
          }),
          {
            detail: { summary: "Shared by me", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .get(
          "/shares/incoming",
          async ({ headers }) => ({
            shares: await sharing.incoming((await claimsOf(headers)).userId),
          }),
          {
            detail: { summary: "Shared with me", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/shares/:id/accept",
          async ({ headers, params, set }) => {
            await sharing.respond((await claimsOf(headers)).userId, params.id, true);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Accept an invite", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/shares/:id/decline",
          async ({ headers, params, set }) => {
            await sharing.respond((await claimsOf(headers)).userId, params.id, false);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Decline an invite", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/invites/accept",
          async ({ headers, body, set }) => {
            await sharing.acceptInvite((await claimsOf(headers)).userId, body.token);
            set.status = 204;
          },
          {
            body: tokenRequestSchema,
            detail: {
              summary: "Accept an invite link",
              tags: ["Sharing"],
              security: [{ bearer: [] }],
            },
          },
        )
        .patch(
          "/shares/:id",
          async ({ headers, params, body, set }) => {
            await sharing.changeRole((await claimsOf(headers)).userId, params.id, body.role);
            set.status = 204;
          },
          {
            params: idParams,
            body: updateShareRequestSchema,
            detail: {
              summary: "Change a share's role",
              tags: ["Sharing"],
              security: [{ bearer: [] }],
            },
          },
        )
        .delete(
          "/shares/:id",
          async ({ headers, params, set }) => {
            await sharing.remove((await claimsOf(headers)).userId, params.id);
            set.status = 204;
          },
          {
            params: idParams,
            detail: {
              summary: "Revoke a share, or leave one",
              tags: ["Sharing"],
              security: [{ bearer: [] }],
            },
          },
        )
        .ws("/sync/ws", {
          // Signs in with its first message instead of the URL, which would land in logs.
          open(ws) {
            const ip = ws.remoteAddress;
            if (limits.socket.take(`ws:${ip}`) !== null) {
              ws.close(1008, "rate limited");
              return;
            }
            const timer = setTimeout(() => ws.close(1008, "no hello"), HELLO_TIMEOUT_MS);
            sockets.set(ws.id, { userId: null, socket: { send: (m) => ws.send(m) }, timer });
          },
          async message(ws, raw) {
            const state = sockets.get(ws.id);
            const parsed = clientMessageSchema.safeParse(raw);
            if (!state || !parsed.success) {
              ws.send(JSON.stringify({ type: "error", code: "invalid_message" }));
              return;
            }
            const message = parsed.data;
            if (message.type === "ping") {
              ws.send(JSON.stringify({ type: "pong" }));
              return;
            }
            if (message.type === "hello") {
              try {
                const claims = await accounts.authenticate(message.token);
                clearTimeout(state.timer);
                if (state.userId) hub.remove(state.userId, state.socket);
                state.userId = claims.userId;
                hub.add(claims.userId, state.socket);
                ws.send(JSON.stringify({ type: "ready" }));
              } catch {
                ws.send(JSON.stringify({ type: "error", code: "unauthorized" }));
                ws.close(1008, "unauthorized");
              }
              return;
            }
            // An ack only says how far a device got; the cursor itself lives on the device.
            if (!state.userId) ws.send(JSON.stringify({ type: "error", code: "unauthorized" }));
          },
          close(ws) {
            const state = sockets.get(ws.id);
            if (!state) return;
            clearTimeout(state.timer);
            if (state.userId) hub.remove(state.userId, state.socket);
            sockets.delete(ws.id);
          },
        }),
    );

  return { app, hub, auth, accounts, sync, sharing };
}
