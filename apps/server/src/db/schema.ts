import { sql } from "drizzle-orm";
import {
  bigint,
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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /// The last sequence number given to one of this account's records. Bumped
  /// under a row lock, so sequence numbers follow commit order per account.
  syncSeq: bigint("sync_seq", { mode: "number" }).notNull().default(0),
  createdAt: created(),
});

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
