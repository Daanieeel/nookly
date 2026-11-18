import { z } from "zod";
import { roleSchema } from "../sync/protocol.ts";

/// The server's REST API, as both ends validate it.

export const emailSchema = z
  .email()
  .max(254)
  .transform((e) => e.trim().toLowerCase());
/// Long enough to resist guessing, short enough for argon2id to stay cheap to check.
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(256);

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
});
export type SignUp = z.input<typeof signUpSchema>;

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
export const deleteAccountRequestSchema = z.object({ password: z.string().min(1).max(256) });

export const userSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  /// Null for an account made without an email.
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

/// better-auth's answer to a sign up or sign in: the session token to send as the
/// bearer token from now on.
export const authResponseSchema = z.object({ token: z.string().nullable() });

export const providersResponseSchema = z.object({ providers: z.array(z.string()) });

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
