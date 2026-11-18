import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/// The server's tables. Synced data is stored generically: one row per record, its
/// fields and clocks as JSON, so a new table or field on the desktop needs no
/// migration here.

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/// better-auth's tables (`src/auth/auth.ts`): accounts, their sign in methods (a
/// password, later OAuth providers), sessions and one time tokens. Ids are UUIDs so
/// they match the `users` rows sync keeps per account.
export const authUser = pgTable("auth_user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  /// A placeholder (`@users.nookly.invalid`) for an account made without an email;
  /// it is never shown or mailed.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  createdAt: created(),
  updatedAt: updated(),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /// What the device calls itself ("MacBook", "iPhone"), for the devices list and
    /// the merge editor.
    deviceName: text("device_name"),
    platform: text("platform"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("auth_session_user").on(t.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    /// `credential` for a password; a provider's name (`google`, `apple`, `github`)
    /// for each OAuth login added later.
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("auth_account_user").on(t.userId)],
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("auth_verification_identifier").on(t.identifier)],
);

/// What sync keeps per account. Created with the account (`auth_user`) and removed
/// with it. Its email and password columns are from before better-auth and no longer
/// used (`docs/development/server.md`).
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /// The last sequence number given to one of this account's records. Bumped
  /// under a row lock, so sequence numbers follow commit order per account.
  syncSeq: bigint("sync_seq", { mode: "number" }).notNull().default(0),
  createdAt: created(),
});

/// Every device that synced for an account, by the id that ends each of its clocks,
/// so a conflict can say which device made each side ("iPhone, 14:02").
export const devices = pgTable(
  "devices",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.deviceId] })],
);

/// File contents an account stored (`src/storage/blobs.ts`), by SHA-256. A row is
/// written only once the object is in S3 with a checksum that matched, so a row
/// always means the bytes are safe.
export const blobs = pgTable(
  "blobs",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sha256: text("sha256").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.sha256] })],
);

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/// Page bodies as Yjs documents (`src/collab`), the state as one update. The block
/// rows in `records` are written from these; see DECISIONS.md D6.
export const documents = pgTable(
  "documents",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    state: bytea("state").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.entityId] })],
);

/// Before better-auth (migration 0001): sessions, refresh and email tokens of the
/// server's own sign in. Kept, unused, so nothing is dropped.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceName: text("device_name").notNull(),
    platform: text("platform").notNull(),
    createdAt: created(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/// Refresh tokens rotate: each use hands out a new one. A token used twice means it
/// was stolen, and the whole session is revoked.
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index("refresh_tokens_session").on(t.sessionId)],
);

/// One time tokens sent by email: verifying the address, resetting the password.
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["verify", "reset"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index("email_tokens_user").on(t.userId)],
);

export const records = pgTable(
  "records",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tbl: text("tbl").notNull(),
    pk: text("pk").notNull(),
    scope: text("scope"),
    fields: jsonb("fields").$type<Record<string, string | number | null>>().notNull(),
    clocks: jsonb("clocks").$type<Record<string, string>>().notNull(),
    deletedClock: text("deleted_clock"),
    seq: bigint("seq", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.tbl, t.pk] }),
    index("records_owner_seq").on(t.ownerId, t.seq),
    index("records_owner_scope_seq").on(t.ownerId, t.scope, t.seq),
  ],
);

/// Edits that lost to concurrent ones, kept so they can be brought back.
export const conflicts = pgTable(
  "conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /// Who made the losing edit (the owner, or a collaborator).
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    tbl: text("tbl").notNull(),
    pk: text("pk").notNull(),
    field: text("field"),
    losingValue: jsonb("losing_value").$type<string | number | null>(),
    losingClock: text("losing_clock"),
    winningClock: text("winning_clock"),
    createdAt: created(),
    /// When someone decided on it (keeping one, the other, both or a mix). The
    /// row stays, so both versions are never lost.
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("conflicts_owner").on(t.ownerId, t.createdAt)],
);

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    /// Set once the recipient has an account (at invite, or when they accept the link).
    recipientId: uuid("recipient_id").references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    status: text("status", { enum: ["pending", "accepted", "declined", "revoked"] }).notNull(),
    inviteTokenHash: text("invite_token_hash").notNull().unique(),
    createdAt: created(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    index("shares_owner").on(t.ownerId, t.entityId),
    index("shares_recipient").on(t.recipientId),
    index("shares_recipient_email").on(t.recipientEmail),
    uniqueIndex("shares_open_once")
      .on(t.ownerId, t.entityId, t.recipientEmail)
      .where(sql`status IN ('pending', 'accepted')`),
  ],
);
