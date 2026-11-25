import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, twoFactor, username } from "better-auth/plugins";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import {
  PLACEHOLDER_EMAIL_DOMAIN,
  claimInvites,
  emailTaken,
  isPlaceholderEmail,
  placeholderEmail,
  realEmail,
  setAccountEmail,
} from "./emails.ts";
import {
  authAccount,
  authSession,
  authTwoFactor,
  authUser,
  authVerification,
  users,
} from "../db/schema.ts";
import type { Logger } from "../log.ts";
import type { Mailer } from "../mail/mailer.ts";
import { confirmEmailEmail, resetPasswordEmail, twoFactorCodeEmail } from "../mail/templates.ts";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "../security/disposable-email.ts";

export const MIN_PASSWORD_LENGTH = 10;
/// How long a half finished sign in waits for its second step, and an emailed code works.
export const TWO_FACTOR_SECONDS = 600;
export const EMAIL_CODE_MINUTES = 5;
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

/// What a provider says about a person, as far as a missing email needs.
interface ProviderProfile {
  id?: string | number;
  sub?: string;
  email?: string | null;
  person?: { email?: string | null };
}
/// What stands in for the missing address.
interface MappedProfile {
  email?: string;
  emailVerified?: boolean;
}

/// A provider that shares no email still signs people in: better-auth needs an address, so
/// it gets a placeholder, which counts as none.
function withAnEmail(provider: string) {
  return (profile: ProviderProfile): MappedProfile => {
    if (profile.email || profile.person?.email) return {};
    const id = profile.id ?? profile.sub ?? crypto.randomUUID();
    return { email: placeholderEmail(`${provider}-${id}`), emailVerified: false };
  };
}

/// Which OAuth providers are configured: each needs its id and secret. Adding one
/// later is setting those two variables, nothing else.
export function socialProviders(config: Config) {
  const providers: Record<
    string,
    {
      clientId: string;
      clientSecret: string;
      disableImplicitSignUp: boolean;
      mapProfileToUser: ReturnType<typeof withAnEmail>;
    }
  > = {};
  const pairs = [
    ["google", config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET],
    ["github", config.GITHUB_CLIENT_ID, config.GITHUB_CLIENT_SECRET],
    ["apple", config.APPLE_CLIENT_ID, config.APPLE_CLIENT_SECRET],
    ["notion", config.NOTION_CLIENT_ID, config.NOTION_CLIENT_SECRET],
  ] as const;
  for (const [name, clientId, clientSecret] of pairs) {
    // During the closed beta a provider only makes an account when the app asked for one with
    // the beta key (`AppSignIn.begin`); a plain sign in never does.
    if (clientId && clientSecret) {
      providers[name] = {
        clientId,
        clientSecret,
        disableImplicitSignUp: Boolean(config.BETA_KEY),
        mapProfileToUser: withAnEmail(name),
      };
    }
  }
  return providers;
}

export function deviceOf(headers: Headers | undefined) {
  const name = headers?.get(DEVICE_NAME_HEADER)?.trim().slice(0, 80) || null;
  const platform = headers?.get(PLATFORM_HEADER)?.trim() ?? "";
  return { deviceName: name, platform: PLATFORMS.has(platform) ? platform : null };
}

/// Accounts, sign in and sessions, through better-auth. Clients send the session
/// token as a bearer token (desktop keychain, phone secure store), never a cookie.
export function createAuth(
  db: Database,
  config: Config,
  mailer: Mailer,
  log: Logger,
  /// Told when an account's email gets confirmed, so its devices can show it at once.
  onVerified: (userId: string) => void = () => {},
) {
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
        twoFactor: authTwoFactor,
      },
    }),
    // The browser that signs in at a provider is not the app that began it, so it brings
    // no state cookie. What stands in for it: the state is kept in the database, and what
    // the browser ends with is a one time code only the app's secret redeems (`AppSignIn`).
    // Nothing is ever connected to an account by itself, whatever email a provider shares:
    // connecting is done from the app, signed in (`AppSignIn.beginLink`).
    account: { skipStateCookieCheck: true, accountLinking: { disableImplicitLinking: true } },
    // Our own limiter (app.ts) covers sign in; better-auth's would count every
    // test and every device behind one address as one.
    rateLimit: { enabled: false },
    trustedOrigins: config.corsOrigins,
    advanced: {
      // Better-auth skips the origin check in tests unless told otherwise; the tests should
      // face the same check as a real server.
      disableOriginCheck: false,
      database: { generateId: () => crypto.randomUUID() },
    },
    session: {
      expiresIn: config.SESSION_TTL_DAYS * DAY_SECONDS,
      // Renewed at most once a day while the device is used: it stays signed in.
      updateAge: DAY_SECONDS,
      additionalFields: {
        deviceName: { type: "string", required: false, input: false },
        platform: { type: "string", required: false, input: false },
        provider: { type: "string", required: false, input: false },
        pending: { type: "boolean", required: false, input: false },
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
      // To the address the password signs in with. An account without a password gets
      // none: a reset must not make one.
      sendResetPassword: async ({ user, token }) => {
        const [password] = await db
          .select({ email: authAccount.email })
          .from(authAccount)
          .where(and(eq(authAccount.userId, user.id), eq(authAccount.providerId, "credential")));
        const to = password ? (password.email ?? user.email) : null;
        if (to === null || isPlaceholderEmail(to)) return;
        await mailer.send({ to, ...resetPasswordEmail(publicUrl, token) });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      afterEmailVerification: async (user) => {
        await db
          .update(authAccount)
          .set({ emailVerified: true })
          .where(
            and(eq(authAccount.userId, user.id), eq(authAccount.email, user.email.toLowerCase())),
          );
        await claimInvites(db, user.id, user.email);
        onVerified(user.id);
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
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 30 }),
      bearer(),
      // The sign in half of two-factor: the plugin holds the half finished sign in and checks
      // the second step. Setting it up is `TwoFactorService`.
      twoFactor({
        issuer: "Nookly",
        // How long a half finished sign in waits for its code.
        twoFactorCookieMaxAge: TWO_FACTOR_SECONDS,
        otpOptions: {
          period: EMAIL_CODE_MINUTES,
          digits: 6,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }) => {
            // Only a confirmed address that turned this on ever gets a code.
            const [row] = await db
              .select({ on: authUser.twoFactorEmail })
              .from(authUser)
              .where(eq(authUser.id, user.id));
            if (!row?.on || !user.emailVerified || isPlaceholderEmail(user.email)) return;
            await mailer.send({
              to: user.email,
              ...twoFactorCodeEmail(publicUrl, otp, EMAIL_CODE_MINUTES),
            });
          },
        },
      }),
    ],
    hooks: {
      // An account made without an email gets a placeholder better-auth needs, unless an email is required.
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
        // Where two-factor is required, an email address is too: its emailed codes are the
        // standard second step, and the way back into an account.
        if (!email && config.REQUIRE_TWO_FACTOR) {
          throw new APIError("BAD_REQUEST", { message: "Enter your email address." });
        }
        if (email && config.BLOCK_DISPOSABLE_EMAIL && isDisposableEmail(email)) {
          throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_MESSAGE });
        }
        // The key goes no further than here.
        if (email) return { context: { ...ctx, body } };
        return {
          context: {
            ...ctx,
            body: {
              ...body,
              name: body.name ?? body.username ?? "",
              email: placeholderEmail(crypto.randomUUID()),
            },
          },
        };
      }),
    },
    user: {
      // Every account is told apart by all its addresses, not only the one better-auth knows:
      // a new account may not take one an account already uses. A provider that signs in
      // again says what its address is now.
      validateUserInfo: async ({ user, source }) => {
        const email = realEmail(user.email);
        if (source.action === "create-user" && email && (await emailTaken(db, email))) {
          return source.method === "oauth"
            ? { error: "account_not_linked" }
            : {
                error: "user_already_exists",
                errorDescription: "An account with this email exists. Sign in instead.",
              };
        }
        const provider = source.oauth?.providerId;
        if (source.action === "sign-in" && provider && email && user.id) {
          await refreshProviderEmail(db, user.id, provider, email, user.emailVerified === true);
        }
        return undefined;
      },
    },
    databaseHooks: {
      account: {
        create: {
          // Only the account's first sign in method is made by better-auth (a sign up).
          // The rest are added by the app, signed in and rechecked (`SignInMethods`).
          before: async (account) => {
            const [other] = await db
              .select({ id: authAccount.id })
              .from(authAccount)
              .where(eq(authAccount.userId, account.userId))
              .limit(1);
            if (other) return false;
            return undefined;
          },
          after: async (account) => {
            const [user] = await db.select().from(authUser).where(eq(authUser.id, account.userId));
            if (!user) return;
            await db
              .update(authAccount)
              .set({ email: realEmail(user.email), emailVerified: user.emailVerified })
              .where(eq(authAccount.id, account.id));
            await db
              .update(authUser)
              .set({ primaryProvider: account.providerId })
              .where(and(eq(authUser.id, user.id), isNull(authUser.primaryProvider)));
          },
        },
      },
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
            const path = ctx?.path ?? "";
            const fromProvider = path.startsWith("/callback/");
            const provider = fromProvider
              ? (ctx?.params?.id ?? null)
              : /^\/sign-(in|up)\//.test(path)
                ? "credential"
                : null;
            // The browser's own session of a provider sign in is only the provider's word:
            // where the account has a second step, it opens nothing.
            let pending = false;
            if (fromProvider) {
              const [user] = await db
                .select({ twoFactor: authUser.twoFactorEnabled })
                .from(authUser)
                .where(eq(authUser.id, session.userId));
              pending = user?.twoFactor === true;
            }
            return { data: { ...session, ...device, provider, pending } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/// Keeps what a provider says its address is, unless the person chose another here. The
/// primary's is the account's own, so that follows a confirmed one nobody else has.
async function refreshProviderEmail(
  db: Database,
  userId: string,
  provider: string,
  email: string,
  verified: boolean,
) {
  const [method] = await db
    .update(authAccount)
    .set({ email, emailVerified: verified })
    .where(
      and(
        eq(authAccount.userId, userId),
        eq(authAccount.providerId, provider),
        ne(authAccount.providerId, "credential"),
        eq(authAccount.emailChosen, false),
      ),
    )
    .returning({ id: authAccount.id });
  if (!method || !verified) return;
  const [user] = await db.select().from(authUser).where(eq(authUser.id, userId));
  if (user?.primaryProvider !== provider || user.email === email) return;
  if (await emailTaken(db, email, userId)) return;
  await setAccountEmail(db, userId, email, true);
}
