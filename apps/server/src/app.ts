import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import {
  createShareRequestSchema,
  deleteAccountRequestSchema,
  forgotPasswordRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  signInRequestSchema,
  tokenRequestSchema,
  updateShareRequestSchema,
} from "@nookly/shared/api";
import { clientMessageSchema, pullRequestSchema, pushRequestSchema } from "@nookly/shared/sync";
import { Elysia } from "elysia";
import { z } from "zod";
import { AuthService } from "./auth/service.ts";
import type { AccessClaims } from "./auth/tokens.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/client.ts";
import { HttpError, unauthorized } from "./errors.ts";
import type { Logger } from "./log.ts";
import type { Mailer } from "./mail/mailer.ts";
import { invitePage, resetPasswordPage, resultPage } from "./pages.ts";
import { RateLimiter } from "./security/rate-limit.ts";
import { ShareService } from "./shares/service.ts";
import { Hub, type LiveSocket } from "./sync/hub.ts";
import { SyncService } from "./sync/service.ts";

export interface AppDeps {
  config: Config;
  db: Database;
  mailer: Mailer;
  log: Logger;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/// How long a fresh WebSocket has to sign in before it is closed.
const HELLO_TIMEOUT_MS = 10_000;

const idParams = z.object({ id: z.uuid() });
const tokenQuery = z.object({ token: z.string().min(20).max(512) });
const resetForm = z.object({ token: z.string().min(20).max(512), password: z.string().max(512) });

export function buildApp({ config, db, mailer, log }: AppDeps) {
  const hub = new Hub();
  const auth = new AuthService(db, config, mailer, log);
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

  async function claimsOf(headers: Record<string, string | undefined>): Promise<AccessClaims> {
    const header = headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw unauthorized();
    return auth.authenticate(token);
  }

  const sockets = new Map<
    string,
    { userId: string | null; socket: LiveSocket; timer: ReturnType<typeof setTimeout> }
  >();

  const app = new Elysia({ serve: { maxRequestBodySize: config.MAX_BODY_BYTES } })
    .use(
      cors({
        // Browsers only: the apps' own requests carry no origin. Anything else is refused.
        origin: (request) => {
          const origin = request.headers.get("origin");
          return origin === null || config.corsOrigins.includes(origin);
        },
        methods: ["GET", "POST", "PATCH", "DELETE"],
        allowedHeaders: ["content-type", "authorization"],
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
      "/verify-email",
      async ({ query, set }) => {
        set.headers["content-type"] = "text/html; charset=utf-8";
        try {
          await auth.verifyEmail(query.token);
          return resultPage("Email confirmed", "You can go back to Nookly.");
        } catch {
          set.status = 400;
          return resultPage(
            "This link doesn't work",
            "It has expired or was already used. Ask Nookly for a new one in Settings.",
          );
        }
      },
      { query: tokenQuery, detail: { hide: true } },
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
          await auth.resetPassword(parsed.data.token, parsed.data.password);
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
        .post(
          "/auth/register",
          async ({ body, ip, set }) => {
            limit(limits.register, `register:${ip}`);
            set.status = 201;
            return auth.register(body.email, body.password, body.device);
          },
          { body: registerRequestSchema, detail: { summary: "Create an account", tags: ["Auth"] } },
        )
        .post(
          "/auth/login",
          async ({ body, ip }) => {
            limit(limits.signIn, `login:${ip}`);
            limit(limits.signIn, `login:${body.email}`);
            return auth.signIn(body.email, body.password, body.device);
          },
          { body: signInRequestSchema, detail: { summary: "Sign in on a device", tags: ["Auth"] } },
        )
        .post(
          "/auth/refresh",
          async ({ body, ip }) => {
            limit(limits.refresh, `refresh:${ip}`);
            return auth.refresh(body.refreshToken);
          },
          {
            body: refreshRequestSchema,
            detail: { summary: "Trade a refresh token for new tokens", tags: ["Auth"] },
          },
        )
        .post(
          "/auth/logout",
          async ({ headers, set }) => {
            await auth.signOut(await claimsOf(headers));
            set.status = 204;
          },
          {
            detail: { summary: "Sign this device out", tags: ["Auth"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/auth/verify-email",
          async ({ body, set }) => {
            await auth.verifyEmail(body.token);
            set.status = 204;
          },
          {
            body: tokenRequestSchema,
            detail: { summary: "Confirm an email address", tags: ["Auth"] },
          },
        )
        .post(
          "/auth/resend-verification",
          async ({ headers, set }) => {
            const claims = await claimsOf(headers);
            limit(limits.email, `verify:${claims.userId}`);
            await auth.resendVerification(claims.userId);
            set.status = 204;
          },
          {
            detail: {
              summary: "Send the confirmation email again",
              tags: ["Auth"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/auth/forgot-password",
          async ({ body, ip, set }) => {
            limit(limits.email, `forgot:${ip}`);
            await auth.forgotPassword(body.email);
            set.status = 202;
          },
          {
            body: forgotPasswordRequestSchema,
            detail: { summary: "Email a password reset link", tags: ["Auth"] },
          },
        )
        .post(
          "/auth/reset-password",
          async ({ body, ip, set }) => {
            limit(limits.email, `reset:${ip}`);
            await auth.resetPassword(body.token, body.password);
            set.status = 204;
          },
          {
            body: resetPasswordRequestSchema,
            detail: { summary: "Set a new password", tags: ["Auth"] },
          },
        )
        .get("/account", async ({ headers }) => auth.me((await claimsOf(headers)).userId), {
          detail: {
            summary: "The signed in account",
            tags: ["Account"],
            security: [{ bearer: [] }],
          },
        })
        .delete(
          "/account",
          async ({ headers, body, set }) => {
            await auth.deleteAccount(await claimsOf(headers), body.password);
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
          async ({ headers }) => ({ sessions: await auth.sessions(await claimsOf(headers)) }),
          {
            detail: { summary: "Devices signed in", tags: ["Account"], security: [{ bearer: [] }] },
          },
        )
        .delete(
          "/sessions/:id",
          async ({ headers, params, set }) => {
            await auth.revokeSession(await claimsOf(headers), params.id);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Sign a device out", tags: ["Account"], security: [{ bearer: [] }] },
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
          "/shares",
          async ({ headers, body, set }) => {
            const claims = await claimsOf(headers);
            limit(limits.share, `share:${claims.userId}`);
            set.status = 201;
            return sharing.create(claims.userId, body.entityId, body.email, body.role);
          },
          {
            body: createShareRequestSchema,
            detail: {
              summary: "Share an item by email",
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
                const claims = await auth.authenticate(message.token);
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

  return { app, hub, auth, sync, sharing };
}

export type App = ReturnType<typeof buildApp>["app"];
