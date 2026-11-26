import { z } from "zod";
import { roleSchema } from "../sync/protocol.ts";

/// The server's REST API, as both ends validate it.

export const emailSchema = z
  .email()
  .max(254)
  .transform((e) => e.trim().toLowerCase());
/// Long enough to resist guessing, short enough for argon2id to stay cheap to check.
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(256);

/// A new password is typed twice, and the two must match. Only the length is demanded of it
/// (`passwordSchema`); how strong it is is advice (`passwordStrength`).
export const newPasswordSchema = z
  .object({ next: passwordSchema, confirm: z.string() })
  .refine((value) => value.next === value.confirm, {
    path: ["confirm"],
    message: "The passwords don't match",
  });

export const deviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(["macos", "windows", "linux", "ios", "android", "web", "other"]),
});
export type DeviceInfo = z.infer<typeof deviceSchema>;

/// A username: letters, digits, dots and underscores, as better-auth's username
/// plugin allows. Sign in takes it in any case.
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters")
  .max(30, "Use at most 30 characters")
  .regex(/^[a-zA-Z0-9_.]+$/, "Use only letters, digits, dots and underscores");
export const MIN_PASSWORD_LENGTH = 10;

export const signUpSchema = z.object({
  username: usernameSchema,
  /// Optional: for resetting a forgotten password and for invites by email.
  email: z
    .union([emailSchema, z.literal("")])
    .optional()
    .transform((e) => (e ? e : undefined)),
  password: passwordSchema,
  /// The closed beta's key, for servers that ask for one.
  betaKey: z.string().max(256).optional(),
  /// The version of the terms the person agreed to, recorded with the account once it exists
  /// (`acceptTerms`). Only Nookly's own server has terms.
  termsVersion: z.string().max(32).optional(),
});
export type SignUp = z.input<typeof signUpSchema>;

/// The create account form of both apps: what the server takes, with the password typed twice
/// (only here, the server never sees the second one) and the beta key as text.
export const signUpFormSchema = z
  .object({
    username: usernameSchema,
    // Needed: emailed codes are the standard second step, and a password reset comes by email.
    email: z
      .string()
      .trim()
      .min(1, "Enter your email address")
      .pipe(z.email("Enter a valid email address").max(254)),
    password: passwordSchema,
    confirm: z.string(),
    betaKey: z.string().max(256),
    /// Ticked: the terms and the minimum age. A server someone runs themselves has no terms
    /// of ours, so the apps leave the box out there and send `true`.
    acceptTerms: z.boolean().refine((value) => value, "Agree to the terms to create an account"),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The passwords don't match",
  });

export const signInSchema = z.object({
  /// A username or an email address.
  identifier: z.string().trim().min(1, "Enter your username or email").max(254),
  password: z.string().min(1, "Enter your password").max(256),
});

export const tokenRequestSchema = z.object({ token: z.string().min(20).max(512) });
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(10).max(512),
  password: passwordSchema,
});
export const acceptTermsRequestSchema = z.object({ version: z.string().trim().min(1).max(32) });
/// The password, for an account that has one. An account made with another provider has none;
/// the apps ask it to type a phrase instead.
export const deleteAccountRequestSchema = z.object({
  password: z.string().min(1).max(256).optional(),
});

export const userSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  /// Null for an account made without an email.
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  /// The version of the terms the account agreed to, null before it did (or on a server
  /// that does not keep it).
  termsVersion: z.string().nullable().default(null),
  /// An account made with another provider has no username until it picks one. Missing
  /// from a server that does not know providers.
  needsUsername: z.boolean().optional(),
  /// The server requires two-factor and this account has not set it up yet: everything but
  /// setting it up is refused until it has.
  twoFactorRequired: z.boolean().optional(),
  /// Whether the account signs in with a password, and the providers (`google`, `github`,
  /// `notion`) it signs in with. Missing from a server that does not say.
  hasPassword: z.boolean().optional(),
  providers: z.array(z.string()).optional(),
});
export type User = z.infer<typeof userSchema>;

/// What can be sent as the second step of a sign in: a code from the authenticator app, a
/// code emailed to the account, or one of the single use recovery codes.
export type TwoFactorMethod = "totp" | "email" | "backup";

/// The server's answer to a password sign in that needs a second step: no session yet, a
/// challenge that stays valid for ten minutes, and what the account can answer it with.
export const twoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challenge: z.string().min(1),
  methods: z.array(z.enum(["totp", "email", "backup"])),
});

/// What an account has for two-factor, for Settings and the setup screen.
export const securitySummarySchema = z.object({
  /// False only on an older server, which has no two-factor for an account that signs in
  /// with another provider.
  available: z.boolean(),
  /// The server requires two-factor of this account.
  required: z.boolean(),
  /// At least one method is on.
  enabled: z.boolean(),
  email: z.object({
    enabled: z.boolean(),
    /// The account has a confirmed email address to send codes to.
    possible: z.boolean(),
    /// The address, null when the account has none.
    address: z.string().nullable(),
    confirmed: z.boolean(),
  }),
  authenticator: z.object({ enabled: z.boolean() }),
  backupCodesLeft: z.number().int().min(0),
});
export type SecuritySummary = z.infer<typeof securitySummarySchema>;

/// Starting to add an authenticator app: the address a QR code shows, and the same secret to
/// type by hand.
export const authenticatorStartSchema = z.object({ uri: z.string(), key: z.string() });
export type AuthenticatorStart = z.infer<typeof authenticatorStartSchema>;

export const backupCodesSchema = z.object({ backupCodes: z.array(z.string()) });

export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(4).max(32) });
export const addEmailRequestSchema = z.object({ email: emailSchema });
export const disableTwoFactorRequestSchema = z.object({ method: z.enum(["email", "totp"]) });

/// What this app says it can do when it signs in, as `?auth=2` on every request: a second
/// step for every way of signing in. A query, not a header: an older server refuses a header
/// it doesn't know. A server that requires two-factor asks an app without it to update.
export const AUTH_QUERY = "auth";
export const AUTH_LEVEL = "2";

/// The ways an account signs in. `credential` is Nookly Signin: an email and a password.
export const NOOKLY_SIGN_IN = "credential";
export const signInMethodSchema = z.object({
  provider: z.string(),
  /// Null when it shared none.
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  /// Its email is the account's: notices and sign in codes go there.
  primary: z.boolean(),
  canBePrimary: z.boolean(),
});
export type SignInMethod = z.infer<typeof signInMethodSchema>;
export const signInSummarySchema = z.object({
  methods: z.array(signInMethodSchema),
  /// The way this device signed in, null when it isn't known.
  current: z.string().nullable(),
  /// The person confirmed it is them a short while ago, so changes need nothing more.
  fresh: z.boolean(),
  /// What can answer the second step of that confirmation; empty without two-factor.
  secondStep: z.array(z.enum(["totp", "email", "backup"])),
  /// The providers this server can connect.
  offered: z.array(z.string()),
});
export type SignInSummary = z.infer<typeof signInSummarySchema>;
/// A change to the ways of signing in. `signedOut` when it removed the one this device
/// came through.
export const signInChangeSchema = signInSummarySchema.extend({ signedOut: z.boolean() });
export type SignInChange = z.infer<typeof signInChangeSchema>;

/// Confirming it is you: the password, or a confirmation made with a provider just before
/// (neither field), and a second step code when the account has two-factor.
export const recheckRequestSchema = z.object({
  password: z.string().min(1).max(256).optional(),
  method: z.enum(["totp", "email", "backup"]).optional(),
  code: z.string().trim().min(4).max(32).optional(),
});
export type Recheck = z.infer<typeof recheckRequestSchema>;

const providerSchema = z.string().min(1).max(30);
export const primaryRequestSchema = z.object({ provider: providerSchema });
export const emailCodeRequestSchema = z.object({ provider: providerSchema, email: emailSchema });
export const emailChangeRequestSchema = emailCodeRequestSchema.extend({
  code: z.string().trim().min(4).max(32),
});
export const addPasswordRequestSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(4).max(32),
  password: passwordSchema,
});
export const setPasswordRequestSchema = z.object({ password: passwordSchema });
export const linkBeginRequestSchema = z.object({
  provider: providerSchema,
  port: z.number().int().min(1024).max(65_535).optional(),
});

/// better-auth's answer to a sign up or sign in: the session token to send as the
/// bearer token from now on.
export const authResponseSchema = z.object({ token: z.string().nullable() });

export const providersResponseSchema = z.object({ providers: z.array(z.string()) });

/// Beginning a sign in with a provider: where the browser goes, and the secret only this
/// app holds, which the code coming back needs.
export const providerBeginResponseSchema = z.object({ url: z.string(), secret: z.string() });
export type ProviderBegin = z.infer<typeof providerBeginResponseSchema>;

/// What a sign in with a provider begins with. `port` is the loopback port a desktop listens
/// on, which a phone has none of; a new account needs `createAccount`, and the beta key
/// while the server is closed.
export type ProviderBeginInput = {
  provider: string;
  port?: number;
  betaKey?: string;
  createAccount?: boolean;
};

export const sessionSchema = z.object({
  id: z.uuid(),
  deviceName: z.string(),
  platform: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  current: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;
export const sessionsResponseSchema = z.object({ sessions: z.array(sessionSchema) });

/// Entity types a user can share: pages and tasks. More types join by being listed
/// here, with their own table in the server's `SHARE_TABLES` (rows scoped to the
/// entity, see `TableScope`).
export const SHAREABLE_TYPES = ["note", "task"] as const;

/// Items others share with this account live in a Space of the sharer's own, named
/// `shared-<owner id>`, which only that person can share on.
export const sharedSpaceId = (ownerId: string) => `shared-${ownerId}`;
export const isSharedSpace = (spaceId: string) => spaceId.startsWith("shared-");

export const shareStatusSchema = z.enum(["pending", "accepted", "declined", "revoked"]);
export const shareRoleSchema = roleSchema.exclude(["owner"]);
export type ShareRole = z.infer<typeof shareRoleSchema>;

/// A username, or an email address for someone who may not have an account yet.
export const recipientSchema = z
  .string()
  .trim()
  .min(1, "Enter a username or an email address")
  .max(254)
  .transform((r) => r.toLowerCase());

export const createShareRequestSchema = z.object({
  entityId: z.string().min(1).max(128),
  recipient: recipientSchema,
  role: shareRoleSchema,
});
export const updateShareRequestSchema = z.object({ role: shareRoleSchema });

export const shareSchema = z.object({
  id: z.uuid(),
  entityId: z.string(),
  entityType: z.string(),
  title: z.string(),
  role: shareRoleSchema,
  status: shareStatusSchema,
  /// The owner's username.
  owner: z.string(),
  /// The username or email address the share went to.
  recipient: z.string(),
  createdAt: z.string(),
});
export type Share = z.infer<typeof shareSchema>;

export const createShareResponseSchema = z.object({
  share: shareSchema,
  /// A link that accepts the invite, for someone without an account yet.
  inviteUrl: z.string(),
});
export const sharesResponseSchema = z.object({ shares: z.array(shareSchema) });

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({ status: z.literal("ok"), version: z.string() });
