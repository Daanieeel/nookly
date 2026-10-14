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

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  device: deviceSchema,
});
export const signInRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  device: deviceSchema,
});
export const refreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const tokenRequestSchema = z.object({ token: z.string().min(20).max(512) });
export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20).max(512),
  password: passwordSchema,
});
export const deleteAccountRequestSchema = z.object({ password: z.string().min(1).max(256) });

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /// Seconds until the access token expires.
  expiresIn: z.number().int(),
  sessionId: z.uuid(),
});
export type Tokens = z.infer<typeof tokensSchema>;

export const authResponseSchema = z.object({ user: userSchema, tokens: tokensSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

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

export const shareStatusSchema = z.enum(["pending", "accepted", "declined", "revoked"]);
export const shareRoleSchema = roleSchema.exclude(["owner"]);
export type ShareRole = z.infer<typeof shareRoleSchema>;

export const createShareRequestSchema = z.object({
  entityId: z.string().min(1).max(128),
  email: emailSchema,
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
  ownerEmail: z.string(),
  recipientEmail: z.string(),
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
