import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import {
  CHALLENGE_HEADER,
  SERVER_VERSION_HEADER,
  addEmailRequestSchema,
  createShareRequestSchema,
  acceptTermsRequestSchema,
  deleteAccountRequestSchema,
  disableTwoFactorRequestSchema,
  resetPasswordRequestSchema,
  twoFactorCodeSchema,
  AUTH_LEVEL,
  AUTH_QUERY,
  addPasswordRequestSchema,
  emailChangeRequestSchema,
  emailCodeRequestSchema,
  linkBeginRequestSchema,
  primaryRequestSchema,
  recheckRequestSchema,
  setPasswordRequestSchema,
  tokenRequestSchema,
  updateShareRequestSchema,
} from "@nookly/shared/api";
import {
  clientMessageSchema,
  missingRequestSchema,
  pullRequestSchema,
  pushRequestSchema,
  conflictReportSchema,
} from "@nookly/shared/sync";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { type AccessClaims, AccountService, updateRequired } from "./auth/accounts.ts";
import { AppSignIn } from "./auth/app-sign-in.ts";
import { TwoFactorService } from "./auth/two-factor.ts";
import { challengeProvider } from "./auth/challenge.ts";
import { EmailCodes } from "./auth/codes.ts";
import { loginAddress } from "./auth/emails.ts";
import { RecheckService } from "./auth/recheck.ts";
import { SignInMethods } from "./auth/sign-in-methods.ts";
import { createAuth, socialProviders } from "./auth/auth.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/client.ts";
import { authSession, authUser } from "./db/schema.ts";
import { HttpError, notFound } from "./errors.ts";
import type { Logger } from "./log.ts";
import type { Mailer } from "./mail/mailer.ts";
import {
  emailConfirmedPage,
  invitePage,
  passwordChangedPage,
  resetPasswordPage,
  resetPasswordScript,
  resultPage,
} from "./pages.ts";
import { clientIp } from "./security/client-ip.ts";
import { RateLimiter } from "./security/rate-limit.ts";
import { ShareService } from "./shares/service.ts";
import { withoutCookies } from "./auth/cookies.ts";
import { Hub, type LiveSocket } from "./sync/hub.ts";
import { SyncService } from "./sync/service.ts";
import { CollabService } from "./collab/service.ts";
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
const resetForm = z.object({
  token: z.string().min(10).max(512),
  password: z.string().max(512),
  confirm: z.string().max(512).optional(),
});
/// better-auth's routes that check a password or send mail, limited per address.
const SIGN_IN_PATHS = new Set(["/v1/auth/sign-in/email", "/v1/auth/sign-in/username"]);
/// The steps of a half finished sign in that better-auth's two-factor plugin answers. Its own
/// setup routes stay shut: they swap the session, and the apps keep one token.
const TWO_FACTOR_STEPS = new Set([
  "/v1/auth/two-factor/verify-totp",
  "/v1/auth/two-factor/verify-otp",
  "/v1/auth/two-factor/send-otp",
  "/v1/auth/two-factor/verify-backup-code",
]);
/// The only routes of better-auth the apps and the pages use. The rest would change how an
/// account signs in, or hand out its provider tokens, without a recheck.
const AUTH_ROUTES = new Set([
  "/v1/auth/sign-up/email",
  "/v1/auth/sign-in/email",
  "/v1/auth/sign-in/username",
  "/v1/auth/sign-out",
  "/v1/auth/request-password-reset",
  "/v1/auth/reset-password",
  "/v1/auth/send-verification-email",
  "/v1/auth/verify-email",
  "/v1/auth/change-password",
  // Where a provider's callback lands when it can't be matched to a sign in.
  "/v1/auth/error",
]);
const CALLBACK = "/v1/auth/callback/";
/// Where a body's email is the one a password signs in with.
const BY_LOGIN_EMAIL = new Set(["/v1/auth/sign-in/email", "/v1/auth/request-password-reset"]);
const MAIL_PATHS = new Set([
  "/v1/auth/request-password-reset",
  "/v1/auth/send-verification-email",
  "/v1/auth/reset-password",
]);

const signInBody = z.looseObject({
  username: z.string().optional(),
  email: z.string().optional(),
});
const sessionAnswer = z.object({ token: z.string() });

/// Whether the app says it can set up and answer two-factor for every way of signing in.
const isCurrent = (request: Request) =>
  new URL(request.url).searchParams.get(AUTH_QUERY) === AUTH_LEVEL;

/// Who a sign in attempt is for (username or email, lowercased), read from a copy of the
/// request so better-auth still gets the body.
async function signInAccount(request: Request): Promise<string | null> {
  const body = signInBody.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );
  if (!body.success) return null;
  const name = body.data.username ?? body.data.email ?? "";
  return name.trim().toLowerCase().slice(0, 320) || null;
}

export function buildApp({ config, db, mailer, log, storage = null }: AppDeps) {
  const hub = new Hub();
  const auth = createAuth(db, config, mailer, log, (userId) =>
    hub.notify(userId, { type: "account" }),
  );
  const accounts = new AccountService(
    db,
    auth,
    storage,
    config.SESSION_TOUCH_SECONDS * 1000,
    config.REQUIRE_TWO_FACTOR,
  );
  const twoFactor = new TwoFactorService(db, auth, config);
  const appSignIn = new AppSignIn(db, auth, config, twoFactor);
  const codes = new EmailCodes(db);
  const recheck = new RecheckService(db, config, mailer, twoFactor, codes);
  const signIn = new SignInMethods({ db, config, mailer, recheck, twoFactor, codes });
  const providers = Object.keys(socialProviders(config));
  const sync = new SyncService(db, hub, log);
  const sharing = new ShareService(db, sync, hub, mailer, config, log);
  const collab = new CollabService(db, sync, accounts, config, log);
  const collabSockets = new Map<string, ReturnType<typeof collab.hocuspocus.handleConnection>>();

  const scale = config.RATE_LIMIT_SCALE;
  const limits = {
    // Wrong passwords and wrong codes from one address. Only the failures count: someone
    // signing in to a few accounts, or a few times, is not guessing.
    signInFailures: new RateLimiter(20 * scale, 15 * MINUTE),
    // Per account, whatever the address: guessing one password from many addresses.
    signInAccount: new RateLimiter(20 * scale, 15 * MINUTE),
    // Starting and finishing a sign in with another account: nothing there to guess.
    appSignIn: new RateLimiter(60 * scale, 15 * MINUTE),
    register: new RateLimiter(10 * scale, HOUR),
    email: new RateLimiter(5 * scale, HOUR),
    refresh: new RateLimiter(60 * scale, MINUTE),
    sync: new RateLimiter(600 * scale, MINUTE),
    share: new RateLimiter(60 * scale, HOUR),
    socket: new RateLimiter(60 * scale, MINUTE),
  };

  /// A live socket's limit, by the client's own address like every request: behind a proxy
  /// the connection's address is the proxy's, which every client shares.
  function socketRefused(forwarded: string | undefined, remote: string | undefined): boolean {
    const ip = clientIp(forwarded, remote, config.TRUST_PROXY, config.TRUSTED_PROXY_HOPS);
    return limits.socket.take(`ws:${ip}`) !== null;
  }

  function tooMany(wait: number) {
    return new HttpError(429, "rate_limited", `Too many requests. Try again in ${wait} seconds.`);
  }

  function limit(limiter: RateLimiter, key: string) {
    const wait = limiter.take(key);
    if (wait !== null) throw tooMany(wait);
  }

  /// Runs a sign in step that can be guessed at: refused once too many from this address
  /// went wrong, and a wrong one (any error) counts.
  async function guessable(ip: string, run: () => Promise<Response>): Promise<Response> {
    const key = `login:${ip}`;
    const wait = limits.signInFailures.blocked(key);
    if (wait !== null) throw tooMany(wait);
    const response = await run();
    if (response.status >= 400) limits.signInFailures.record(key);
    return response;
  }

  const claimsOf = (request: Request) =>
    accounts.fromHeaders(request.headers, { current: isCurrent(request) });
  /// The answers to two-factor codes being checked right now, by what was asked.
  const answering = new Map<string, Promise<Response>>();
  /// The cookie better-auth keeps a half finished sign in in.
  const challengeCookie = async () => (await auth.$context).createAuthCookie("two_factor").name;

  /// A password sign in that needs a second step answers with the challenge in its body, not
  /// in a cookie, and says what can answer it. Anything else passes through.
  async function challengeFromCookie(response: Response): Promise<Response> {
    if (response.status !== 200 || !response.headers.get("content-type")?.includes("json")) {
      return response;
    }
    const body = z.object({ twoFactorRedirect: z.literal(true) }).safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    if (!body.success) return response;
    const name = await challengeCookie();
    const cookie = response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`));
    const challenge = cookie?.slice(name.length + 1).split(";")[0] ?? "";
    if (!challenge) return response;
    const methods = await twoFactor.methodsFor(challenge);
    return Response.json({ twoFactorRequired: true, challenge, methods });
  }

  /// For what an account that still owes two-factor may do: see itself, set it up, leave.
  const claimsForSetup = (request: Request) =>
    accounts.fromHeaders(request.headers, { setup: true, current: isCurrent(request) });

  /// A change to how the account signs in: the person confirmed it is them just before.
  async function claimsRechecked(request: Request): Promise<AccessClaims> {
    const claims = await claimsForSetup(request);
    await recheck.require(claims, isCurrent(request));
    return claims;
  }

  /// The token of an answer that started a session, null when it didn't.
  async function sessionOf(response: Response): Promise<string | null> {
    if (response.status !== 200) return null;
    const body = sessionAnswer.safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    return body.success ? body.data.token : null;
  }

  /// A password sign in from an app that can't set two-factor up gets no session where it
  /// is required and the account has none.
  async function refuseOutdated(response: Response, current: boolean): Promise<Response> {
    if (current || !config.REQUIRE_TWO_FACTOR) return response;
    const token = await sessionOf(response);
    if (token === null) return response;
    const [user] = await db
      .select({ twoFactor: authUser.twoFactorEnabled })
      .from(authSession)
      .innerJoin(authUser, eq(authUser.id, authSession.userId))
      .where(eq(authSession.token, token));
    if (user?.twoFactor) return response;
    await db.delete(authSession).where(eq(authSession.token, token));
    throw updateRequired();
  }

  /// The request with its email replaced by the address better-auth knows the account by.
  async function byLoginEmail(request: Request): Promise<Request> {
    const body = signInBody.safeParse(
      await request
        .clone()
        .json()
        .catch(() => null),
    );
    if (!body.success || !body.data.email) return request;
    const email = await loginAddress(db, body.data.email);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify({ ...body.data, email }),
    });
  }

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

  /// An error's body. It carries the server's version, so an app can tell whether it or the
  /// server is the one out of date.
  const failure = (error: string, message: string) => ({
    error,
    message,
    serverVersion: config.version,
  });

  const app = new Elysia({
    // File uploads stream up to MAX_BLOB_BYTES; everything else is held to
    // MAX_BODY_BYTES by `onRequest` below.
    serve: { maxRequestBodySize: Math.max(config.MAX_BODY_BYTES, config.MAX_BLOB_BYTES) + 1024 },
  })
    .onRequest(({ request, set }) => {
      // Every answer says which version of the server it came from.
      set.headers[SERVER_VERSION_HEADER] = config.version;
      if (new URL(request.url).pathname.startsWith("/v1/blobs/")) return;
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > config.MAX_BODY_BYTES) {
        set.status = 413;
        return failure("too_large", "The request is too large.");
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
          CHALLENGE_HEADER,
        ],
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
        exposeHeaders: ["set-auth-token", SERVER_VERSION_HEADER],
        credentials: false,
        maxAge: 600,
      }),
    )
    .use(
      // The reference lists every route, which a production server has no need to show.
      config.apiDocs
        ? openapi({
            path: "/docs",
            mapJsonSchema: { zod: z.toJSONSchema },
            documentation: {
              info: { title: "Nookly sync server", version: config.version },
              components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
            },
          })
        : new Elysia(),
    )
    .derive(({ request, server }) => ({
      ip: clientIp(
        request.headers.get("x-forwarded-for"),
        server?.requestIP(request)?.address,
        config.TRUST_PROXY,
        config.TRUSTED_PROXY_HOPS,
      ),
      started: performance.now(),
    }))
    .onError(({ code, error, set }) => {
      if (error instanceof HttpError) {
        set.status = error.status;
        return failure(error.code, error.message);
      }
      if (code === "VALIDATION") {
        set.status = 422;
        return failure("invalid_request", "Some of the request is missing or invalid.");
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return failure("not_found", "Not found.");
      }
      if (code === "PARSE") {
        set.status = 400;
        return failure("invalid_body", "The request body couldn't be read.");
      }
      log.error("unhandled error", {
        code: String(code),
        error: error instanceof Error ? error.message : String(error),
      });
      set.status = 500;
      return failure("internal", "Something went wrong on the server.");
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
          return failure("unavailable", "The database can't be reached.");
        }
      },
      { detail: { summary: "Health check", tags: ["Server"] } },
    )
    // Pages the links in emails open, and the logo they and the emails show.
    .get(
      "/logo.png",
      ({ set }) => {
        set.headers["content-type"] = "image/png";
        set.headers["cache-control"] = "public, max-age=86400";
        return Bun.file(new URL("./assets/logo.png", import.meta.url));
      },
      { detail: { hide: true } },
    )
    // Where a browser lands after signing in with another account; it hands the app a code.
    .get(
      "/oauth/done",
      async ({ query, request }) => {
        const result = await appSignIn.complete(query, request.headers);
        const headers = new Headers({
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        if (result.clearCookies) {
          const secure = config.PUBLIC_URL.startsWith("https:");
          for (const cookie of AppSignIn.clearCookies(secure)) headers.append("set-cookie", cookie);
        }
        return new Response(result.html, { status: result.status, headers });
      },
      {
        query: z.object({
          t: z.string().max(100).optional(),
          p: z.string().max(100).optional(),
          error: z.string().max(100).optional(),
        }),
        detail: { hide: true },
      },
    )
    .get(
      "/verified",
      ({ query, set }) => {
        set.headers["content-type"] = "text/html; charset=utf-8";
        if (query.error) {
          set.status = 400;
          return resultPage(
            "This link doesn't work",
            "It has expired or was already used. Ask Nookly for a new one in Settings.",
            "error",
          );
        }
        return emailConfirmedPage();
      },
      { query: z.object({ error: z.string().max(100).optional() }), detail: { hide: true } },
    )
    // The reset page's script: the app's own password strength check, bundled once.
    .get(
      "/reset-password.js",
      async ({ set }) => {
        const script = await resetPasswordScript();
        if (!script) {
          set.status = 404;
          return "";
        }
        set.headers["content-type"] = "text/javascript; charset=utf-8";
        set.headers["cache-control"] = "public, max-age=3600";
        return script;
      },
      { detail: { hide: true } },
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
        if (body.confirm !== undefined && body.confirm !== body.password) {
          set.status = 400;
          return resetPasswordPage(body.token, "The passwords don't match.");
        }
        try {
          await auth.api.resetPassword({
            body: { token: parsed.data.token, newPassword: parsed.data.password },
          });
          return passwordChangedPage();
        } catch {
          set.status = 400;
          return resultPage(
            "This link doesn't work",
            "It has expired or was already used. Ask for a new one.",
            "error",
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
        // Signing in with another account, from the apps (see AppSignIn).
        .post(
          "/auth/app/begin",
          ({ body, request, ip }) => {
            limit(limits.appSignIn, `app-sign-in:${ip}`);
            return appSignIn.begin(body, request.headers);
          },
          {
            body: z.object({
              provider: z.string().max(30),
              port: z.number().int().min(1024).max(65_535).optional(),
              betaKey: z.string().max(200).optional(),
              createAccount: z.boolean().optional(),
            }),
            detail: { hide: true },
          },
        )
        .post(
          "/account/confirm/begin",
          async ({ request, body, ip }) => {
            limit(limits.appSignIn, `app-sign-in:${ip}`);
            return appSignIn.beginConfirmation(
              (await claimsForSetup(request)).userId,
              body,
              request.headers,
            );
          },
          {
            body: z.object({
              provider: z.string().max(30),
              port: z.number().int().min(1024).max(65_535).optional(),
            }),
            detail: {
              summary: "Begin confirming with the provider an account signs in with",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/confirm/redeem",
          async ({ request, body, set, ip }) => {
            limit(limits.appSignIn, `app-sign-in:${ip}`);
            await appSignIn.redeemConfirmation(
              (await claimsForSetup(request)).userId,
              body.code,
              body.secret,
            );
            set.status = 204;
          },
          {
            body: z.object({ code: z.string().max(100), secret: z.string().max(200) }),
            detail: {
              summary: "Finish confirming with the provider",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/auth/app/redeem",
          ({ body, request, ip }) => {
            limit(limits.appSignIn, `app-sign-in:${ip}`);
            return appSignIn.redeem(body.code, body.secret, request.headers, isCurrent(request));
          },
          {
            body: z.object({ code: z.string().max(100), secret: z.string().max(200) }),
            detail: { hide: true },
          },
        )
        // Everything else under /v1/auth is better-auth: sign up and in (username or
        // email), sign out, sessions, password reset, email verification, OAuth.
        .all(
          "/auth/*",
          async ({ request, ip }) => {
            const path = new URL(request.url).pathname;
            // Only the apps' own begin starts a sign in with a provider: it is where the
            // beta key is asked for before a new account is made.
            // Nothing else of better-auth's is reachable (see `AUTH_ROUTES`).
            const known =
              AUTH_ROUTES.has(path) || TWO_FACTOR_STEPS.has(path) || path.startsWith(CALLBACK);
            if (!known) throw notFound();
            if (path.startsWith(CALLBACK) && request.method === "GET") {
              // Connecting a provider is the server's own flow, not better-auth's.
              const next = await appSignIn.linkCallback(
                path.slice(CALLBACK.length),
                new URL(request.url).searchParams,
              );
              if (next !== null)
                return new Response(null, { status: 302, headers: { location: next } });
            }
            if (path === "/v1/auth/change-password") {
              await claimsRechecked(request);
            }
            const current = isCurrent(request);
            // A new account from an app that can't set two-factor up would be stuck.
            if (path === "/v1/auth/sign-up/email" && !current && config.REQUIRE_TWO_FACTOR) {
              throw updateRequired();
            }
            const cookieless = withoutCookies(request);
            if (path.startsWith("/v1/auth/two-factor/")) {
              // The apps send no cookies: the half finished sign in comes in a header, and
              // goes to better-auth as the cookie it keeps it in.
              const step = async () => {
                const challenge = request.headers.get(CHALLENGE_HEADER);
                if (!challenge) return auth.handler(cookieless);
                const headers = new Headers(cookieless.headers);
                headers.set("cookie", `${await challengeCookie()}=${challenge}`);
                // Better-auth refuses a request with a cookie and a missing or "null" Origin
                // as a possible forgery. A phone sends none, or the text "null"; this cookie
                // is ours, so the server stands in as the origin. A browser's own (checked
                // against the trusted ones) stays.
                const origin = headers.get("origin")?.trim();
                if (!origin || origin === "null") {
                  headers.set("origin", new URL(config.PUBLIC_URL).origin);
                }
                const provider = await challengeProvider(db, challenge);
                const response = await auth.handler(new Request(cookieless, { headers }));
                const token = await sessionOf(response);
                if (token !== null) {
                  await db
                    .update(authSession)
                    .set({ provider })
                    .where(eq(authSession.token, token));
                }
                return response;
              };
              // Asking for a code costs an email; answering one is what gets guessed.
              if (path.endsWith("/send-otp")) {
                limit(limits.email, `otp:${ip}`);
                return step();
              }
              // A code pasted into a phone can arrive twice at once. Better-auth spends the
              // challenge's attempt on the first and answers the second "Invalid two factor
              // cookie", so identical requests in flight share the one answer.
              const challenge = request.headers.get(CHALLENGE_HEADER);
              const key = challenge ? `${path}\n${challenge}\n${await request.clone().text()}` : "";
              const running = key ? answering.get(key) : undefined;
              if (running) return (await running).clone();
              const answer = guessable(ip, step);
              if (key) {
                answering.set(key, answer);
                const done = () => answering.delete(key);
                answer.then(done, done);
              }
              return (await answer).clone();
            }
            const forwarded =
              request.method === "POST" && BY_LOGIN_EMAIL.has(path)
                ? await byLoginEmail(cookieless)
                : cookieless;
            if (request.method === "POST" && SIGN_IN_PATHS.has(path)) {
              return guessable(ip, async () => {
                const account = await signInAccount(request);
                if (account) limit(limits.signInAccount, `login-account:${account}`);
                const answer = await challengeFromCookie(await auth.handler(forwarded));
                return refuseOutdated(answer, current);
              });
            }
            if (request.method === "POST" && path === "/v1/auth/sign-up/email") {
              limit(limits.register, `register:${ip}`);
            }
            if (request.method === "POST" && MAIL_PATHS.has(path))
              limit(limits.email, `mail:${ip}`);
            return auth.handler(forwarded);
          },
          { parse: "none", detail: { hide: true } },
        )
        .get(
          "/account",
          async ({ request }) => accounts.me((await claimsForSetup(request)).userId),
          {
            detail: {
              summary: "The signed in account",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/username",
          async ({ request, body }) =>
            accounts.setUsername((await claimsForSetup(request)).userId, body.username),
          {
            body: z.object({ username: z.string().max(100) }),
            detail: {
              summary: "Pick the username of an account made with another provider",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/recheck",
          async ({ request, body, set }) => {
            const claims = await claimsForSetup(request);
            limit(limits.signInAccount, `recheck:${claims.userId}`);
            await recheck.confirm(claims, body);
            set.status = 204;
          },
          {
            body: recheckRequestSchema,
            detail: {
              summary: "Confirm it is you, before changing how the account signs in",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/recheck/email",
          async ({ request, set }) => {
            const claims = await claimsForSetup(request);
            limit(limits.email, `recheck:${claims.userId}`);
            await recheck.sendCode(claims);
            set.status = 204;
          },
          {
            detail: {
              summary: "Email the code that answers a recheck's second step",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .get(
          "/account/sign-in",
          async ({ request }) => signIn.summary(await claimsForSetup(request)),
          {
            detail: {
              summary: "The ways the account signs in",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/link/begin",
          async ({ request, body, ip }) => {
            const claims = await claimsRechecked(request);
            limit(limits.appSignIn, `app-sign-in:${ip}`);
            return appSignIn.beginLink(claims.userId, body);
          },
          {
            body: linkBeginRequestSchema,
            detail: {
              summary: "Begin connecting a provider",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/link/redeem",
          async ({ request, body, ip }) => {
            const claims = await claimsRechecked(request);
            limit(limits.appSignIn, `app-sign-in:${ip}`);
            await appSignIn.redeemLink(claims.userId, body.code, body.secret);
            await signIn.settlePrimary(claims.userId);
            return { ...(await signIn.summary(claims)), signedOut: false };
          },
          {
            body: z.object({ code: z.string().max(100), secret: z.string().max(200) }),
            detail: {
              summary: "Finish connecting a provider",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/primary",
          async ({ request, body }) =>
            signIn.setPrimary(await claimsRechecked(request), body.provider),
          {
            body: primaryRequestSchema,
            detail: {
              summary: "Make a way of signing in the primary one",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/email/code",
          async ({ request, body, set, ip }) => {
            const claims = await claimsRechecked(request);
            limit(limits.email, `mail:${ip}`);
            await signIn.sendEmailCode(claims, body.provider, body.email);
            set.status = 204;
          },
          {
            body: emailCodeRequestSchema,
            detail: {
              summary: "Email a code to a new address",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/email",
          async ({ request, body }) => {
            const claims = await claimsRechecked(request);
            limit(limits.signInAccount, `code:${claims.userId}`);
            return signIn.changeEmail(claims, body);
          },
          {
            body: emailChangeRequestSchema,
            detail: {
              summary: "Change the email of a way of signing in, with the code sent to it",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/password",
          async ({ request, body }) => {
            const claims = await claimsRechecked(request);
            limit(limits.signInAccount, `code:${claims.userId}`);
            return signIn.addPassword(claims, body);
          },
          {
            body: addPasswordRequestSchema,
            detail: {
              summary: "Add Nookly Signin: an email and a password",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/sign-in/password/change",
          async ({ request, body }) =>
            signIn.setPassword(await claimsRechecked(request), body.password),
          {
            body: setPasswordRequestSchema,
            detail: {
              summary: "Set a new Nookly Signin password",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .delete(
          "/account/sign-in/:provider",
          async ({ request, params }) => {
            const claims = await claimsRechecked(request);
            const { change, ended } = await signIn.unlink(claims, params.provider);
            for (const id of ended) hub.endSession(claims.userId, id);
            return change;
          },
          {
            params: z.object({ provider: z.string().max(30) }),
            detail: {
              summary: "Disconnect a way of signing in",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .get(
          "/account/security",
          async ({ request }) => twoFactor.summary((await claimsForSetup(request)).userId),
          {
            detail: {
              summary: "What the account has for two-factor",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/email",
          async ({ request, body, ip }) => {
            const claims = await claimsRechecked(request);
            limit(limits.email, `mail:${ip}`);
            await twoFactor.addEmail(claims.userId, body.email);
            return accounts.me(claims.userId);
          },
          {
            body: addEmailRequestSchema,
            detail: {
              summary: "Give an account made without an email one, and send it a confirmation",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/two-factor/email",
          async ({ request }) => {
            const claims = await claimsRechecked(request);
            return twoFactor.enableEmail(claims.userId);
          },
          {
            detail: {
              summary: "Turn on emailed sign in codes",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/two-factor/authenticator",
          async ({ request }) => {
            const claims = await claimsRechecked(request);
            return twoFactor.startAuthenticator(claims.userId);
          },
          {
            detail: {
              summary: "Start adding an authenticator app",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/two-factor/authenticator/confirm",
          async ({ request, body }) => {
            const claims = await claimsForSetup(request);
            limit(limits.signInAccount, `code:${claims.userId}`);
            return { backupCodes: await twoFactor.confirmAuthenticator(claims.userId, body.code) };
          },
          {
            body: twoFactorCodeSchema,
            detail: {
              summary: "Switch the authenticator app on with a code from it",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/two-factor/disable",
          async ({ request, body }) => {
            const claims = await claimsRechecked(request);
            return twoFactor.disable(claims.userId, body.method);
          },
          {
            body: disableTwoFactorRequestSchema,
            detail: {
              summary: "Turn a two-factor method off",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/two-factor/backup-codes",
          async ({ request }) => {
            const claims = await claimsRechecked(request);
            return { backupCodes: await twoFactor.newBackupCodes(claims.userId) };
          },
          {
            detail: {
              summary: "Replace the recovery codes",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/account/terms",
          async ({ request, body }) =>
            accounts.acceptTerms((await claimsForSetup(request)).userId, body.version),
          {
            body: acceptTermsRequestSchema,
            detail: {
              summary: "Record that the account agreed to a version of the terms",
              tags: ["Account"],
              security: [{ bearer: [] }],
            },
          },
        )
        .delete(
          "/account",
          async ({ request, body, set }) => {
            const claims = await accounts.fromHeaders(request.headers, { leaving: true });
            await accounts.deleteAccount(claims, body.password);
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
          async ({ request }) => ({ sessions: await accounts.sessions(await claimsOf(request)) }),
          {
            detail: { summary: "Devices signed in", tags: ["Account"], security: [{ bearer: [] }] },
          },
        )
        .delete(
          "/sessions/:id",
          async ({ request, params, set }) => {
            const claims = await claimsOf(request);
            await accounts.revokeSession(claims, params.id);
            hub.endSession(claims.userId, params.id);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Sign a device out", tags: ["Account"], security: [{ bearer: [] }] },
          },
        )
        .put(
          "/blobs/:sha256",
          async ({ request, params, set }) => {
            const claims = await claimsOf(request);
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
          async ({ request, params, set }) => {
            const claims = await claimsOf(request);
            set.status = (await files().exists(claims.userId, params.sha256)) ? 200 : 404;
            return "";
          },
          { params: blobParams, detail: { hide: true } },
        )
        .get(
          "/blobs/:sha256",
          async ({ request, params }) => {
            const claims = await claimsOf(request);
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
          async ({ request, body }) => {
            const claims = await claimsOf(request);
            limit(limits.sync, `sync:${claims.userId}`);
            const results = await sync.push(claims.userId, body.changes);
            const device = await accounts.deviceOf(claims.sessionId);
            await sync.registerDevice(claims.userId, body.changes, device.name, device.platform);
            // A device told its clock is wrong needs the right time to send the change again.
            const skewed = results.some((r) => r.reason === "clock-skew");
            return skewed ? { results, serverTime: Date.now() } : { results };
          },
          {
            body: pushRequestSchema,
            detail: { summary: "Send local changes", tags: ["Sync"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/sync/pull",
          async ({ request, body }) => {
            const claims = await claimsOf(request);
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
        .get(
          "/conflicts",
          async ({ request }) => ({
            conflicts: await sync.conflicts((await claimsOf(request)).userId),
          }),
          {
            detail: {
              summary: "Changes made on two devices that nobody decided on yet",
              tags: ["Sync"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/conflicts",
          async ({ request, body }) => sync.reportConflict((await claimsOf(request)).userId, body),
          {
            body: conflictReportSchema,
            detail: {
              summary: "Hand over a clash only this device saw, so every device offers it",
              tags: ["Sync"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/conflicts/:id/resolve",
          async ({ request, params, set }) => {
            await sync.resolveConflict((await claimsOf(request)).userId, params.id);
            set.status = 204;
          },
          {
            params: idParams,
            detail: {
              summary: "Mark a conflict decided on every device",
              tags: ["Sync"],
              security: [{ bearer: [] }],
            },
          },
        )
        .get(
          "/devices",
          async ({ request }) => ({
            devices: await sync.devices((await claimsOf(request)).userId),
          }),
          {
            detail: {
              summary: "The account's devices by the id in their clocks",
              tags: ["Sync"],
              security: [{ bearer: [] }],
            },
          },
        )
        .post(
          "/sync/missing",
          async ({ request, body }) => {
            const claims = await claimsOf(request);
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
          async ({ request, body, set }) => {
            const claims = await claimsOf(request);
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
          async ({ request }) => ({
            shares: await sharing.outgoing((await claimsOf(request)).userId),
          }),
          {
            detail: { summary: "Shared by me", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .get(
          "/shares/incoming",
          async ({ request }) => ({
            shares: await sharing.incoming((await claimsOf(request)).userId),
          }),
          {
            detail: { summary: "Shared with me", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/shares/:id/accept",
          async ({ request, params, set }) => {
            await sharing.respond((await claimsOf(request)).userId, params.id, true);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Accept an invite", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/shares/:id/decline",
          async ({ request, params, set }) => {
            await sharing.respond((await claimsOf(request)).userId, params.id, false);
            set.status = 204;
          },
          {
            params: idParams,
            detail: { summary: "Decline an invite", tags: ["Sharing"], security: [{ bearer: [] }] },
          },
        )
        .post(
          "/invites/accept",
          async ({ request, body, set }) => {
            await sharing.acceptInvite((await claimsOf(request)).userId, body.token);
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
          async ({ request, params, body, set }) => {
            await sharing.changeRole((await claimsOf(request)).userId, params.id, body.role);
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
          async ({ request, params, set }) => {
            await sharing.remove((await claimsOf(request)).userId, params.id);
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
        // Page documents (Yjs), through Hocuspocus. It signs in with the session token
        // in its own first message, like the sync socket.
        .ws("/collab", {
          open(ws) {
            if (socketRefused(ws.data.headers["x-forwarded-for"], ws.remoteAddress)) {
              ws.close(1008, "rate limited");
              return;
            }
            const request = new Request(`${config.PUBLIC_URL.replace(/\/$/, "")}/v1/collab`);
            collabSockets.set(ws.id, collab.hocuspocus.handleConnection(ws.raw, request));
          },
          message(ws, message) {
            const data =
              message instanceof Uint8Array
                ? message
                : message instanceof ArrayBuffer
                  ? new Uint8Array(message)
                  : null;
            if (data) collabSockets.get(ws.id)?.handleMessage(data);
          },
          close(ws) {
            collabSockets.get(ws.id)?.handleClose();
            collabSockets.delete(ws.id);
          },
        })
        .ws("/sync/ws", {
          // Signs in with its first message instead of the URL, which would land in logs.
          open(ws) {
            if (socketRefused(ws.data.headers["x-forwarded-for"], ws.remoteAddress)) {
              ws.close(1008, "rate limited");
              return;
            }
            const timer = setTimeout(() => ws.close(1008, "no hello"), HELLO_TIMEOUT_MS);
            sockets.set(ws.id, {
              userId: null,
              socket: { send: (m) => ws.send(m), close: () => ws.close(1008, "signed out") },
              timer,
            });
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
                state.socket.sessionId = claims.sessionId;
                hub.add(claims.userId, state.socket);
                ws.send(JSON.stringify({ type: "ready" }));
              } catch (error) {
                // Only a session that is over is called unauthorized: an app told that
                // clears the device. One that owes two-factor, or a server that failed,
                // says so and the app tries again.
                const code = error instanceof HttpError ? error.code : "internal";
                ws.send(JSON.stringify({ type: "error", code }));
                ws.close(1008, code);
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

  return { app, hub, auth, accounts, sync, sharing, collab };
}
