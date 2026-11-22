import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, username } from "better-auth/plugins";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  shares,
  users,
} from "../db/schema.ts";
import type { Logger } from "../log.ts";
import type { Mailer } from "../mail/mailer.ts";
import { confirmEmailEmail, resetPasswordEmail } from "../mail/templates.ts";

/// The domain of the email an account made without one gets. `.invalid` can never
/// be delivered to, and the API shows such an address as no email at all.
export const PLACEHOLDER_EMAIL_DOMAIN = "users.nookly.invalid";
export const isPlaceholderEmail = (email: string) => email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);

export const MIN_PASSWORD_LENGTH = 10;
const DAY_SECONDS = 86_400;

/// The parts of a sign up body the placeholder email needs; the rest passes through.
const signUpBody = z.looseObject({
  email: z.string().optional(),
  username: z.string().optional(),
  name: z.string().optional(),
  betaKey: z.string().optional(),
});

/// Whether `given` is the beta key, without telling how much of it matched.
export function isBetaKey(expected: string, given: string) {
  const digest = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest();
  return timingSafeEqual(digest(expected), digest(given.trim()));
}

/// Headers a client names itself with when it signs in, for its session.
export const DEVICE_NAME_HEADER = "x-nookly-device-name";
export const PLATFORM_HEADER = "x-nookly-platform";
const PLATFORMS = new Set(["macos", "windows", "linux", "ios", "android", "web", "other"]);

/// Which OAuth providers are configured: each needs its id and secret. Adding one
/// later is setting those two variables, nothing else.
export function socialProviders(config: Config) {
  const providers: Record<
    string,
    { clientId: string; clientSecret: string; disableSignUp: boolean }
  > = {};
  const pairs = [
    ["google", config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET],
    ["github", config.GITHUB_CLIENT_ID, config.GITHUB_CLIENT_SECRET],
    ["apple", config.APPLE_CLIENT_ID, config.APPLE_CLIENT_SECRET],
  ] as const;
  for (const [name, clientId, clientSecret] of pairs) {
    // During the closed beta only a sign up with the key makes accounts, never a provider.
    if (clientId && clientSecret) {
      providers[name] = {
        clientId,
        clientSecret,
        disableSignUp: Boolean(config.BETA_KEY),
      };
    }
  }
  return providers;
}

function deviceOf(headers: Headers | undefined) {
  const name = headers?.get(DEVICE_NAME_HEADER)?.trim().slice(0, 80) || null;
  const platform = headers?.get(PLATFORM_HEADER)?.trim() ?? "";
  return { deviceName: name, platform: PLATFORMS.has(platform) ? platform : null };
}

/// Accounts, sign in and sessions, through better-auth. Clients send the session
/// token as a bearer token (desktop keychain, phone secure store), never a cookie.
export function createAuth(db: Database, config: Config, mailer: Mailer, log: Logger) {
  const publicUrl = config.PUBLIC_URL.replace(/\/$/, "");
  return betterAuth({
    appName: "Nookly",
    baseURL: publicUrl,
    basePath: "/v1/auth",
    secret: config.AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    // Our own limiter (app.ts) covers sign in; better-auth's would count every
    // test and every device behind one address as one.
    rateLimit: { enabled: false },
    trustedOrigins: config.corsOrigins,
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
    session: {
      expiresIn: config.SESSION_TTL_DAYS * DAY_SECONDS,
      // Renewed at most once a day while the device is used: it stays signed in.
      updateAge: DAY_SECONDS,
      additionalFields: {
        deviceName: { type: "string", required: false, input: false },
        platform: { type: "string", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => Bun.password.hash(password, { algorithm: "argon2id" }),
        verify: ({ hash, password }) => Bun.password.verify(password, hash),
      },
      sendResetPassword: async ({ user, token }) => {
        if (isPlaceholderEmail(user.email)) return;
        await mailer.send({ to: user.email, ...resetPasswordEmail(publicUrl, token) });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Invites sent to the address before it was confirmed now belong to the
      // account; never before, so nobody can claim invites to an address they
      // don't hold.
      afterEmailVerification: async (user) => {
        await db
          .update(shares)
          .set({ recipientId: user.id })
          .where(
            and(eq(shares.recipientEmail, user.email.toLowerCase()), isNull(shares.recipientId)),
          );
      },
      sendVerificationEmail: async ({ user, url }) => {
        if (isPlaceholderEmail(user.email)) return;
        await mailer
          .send({ to: user.email, ...confirmEmailEmail(publicUrl, url) })
          .catch((error: Error) =>
            log.error("couldn't send the verification email", { error: error.message }),
          );
      },
    },
    socialProviders: socialProviders(config),
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 }), bearer()],
    hooks: {
      // An account made without an email gets a placeholder better-auth needs.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const parsed = signUpBody.safeParse(ctx.body ?? {});
        // The closed beta: no key, no account. Checked before anything is made.
        if (config.BETA_KEY) {
          const given = parsed.success ? (parsed.data.betaKey ?? "") : "";
          if (!given.trim()) {
            throw new APIError("FORBIDDEN", {
              message: "Enter the beta key to create an account.",
            });
          }
          if (!isBetaKey(config.BETA_KEY, given)) {
            throw new APIError("FORBIDDEN", { message: "That beta key isn't right." });
          }
        }
        // better-auth's own validation answers a body that isn't one.
        if (!parsed.success) return;
        const { betaKey: _betaKey, ...body } = parsed.data;
        const email = body.email?.trim() ?? "";
        if (email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)) {
          throw new APIError("BAD_REQUEST", { message: "Use your own email address." });
        }
        // The key goes no further than here.
        if (email) return { context: { ...ctx, body } };
        return {
          context: {
            ...ctx,
            body: {
              ...body,
              name: body.name ?? body.username ?? "",
              email: `${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`,
            },
          },
        };
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Sync's own row for the account.
          after: async (user) => {
            await db.insert(users).values({ id: user.id, email: user.email }).onConflictDoNothing();
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const device = deviceOf(ctx?.headers ?? ctx?.request?.headers);
            return { data: { ...session, ...device } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
