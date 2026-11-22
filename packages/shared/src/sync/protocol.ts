import { z } from "zod";
import { decodePk, syncedColumns, syncedTable } from "../schema.ts";

/// The sync protocol, as both ends validate it (docs/development/sync-protocol.md).

/// The account's own data. A dataset someone shared with the account is `share:<id>`.
export const OWN_DATASET = "own";
export const shareDataset = (shareId: string) => `share:${shareId}`;

export const MAX_PUSH_CHANGES = 500;
export const MAX_PULL_RECORDS = 1000;
/// The longest text a synced field may hold (a page block, a long description).
export const MAX_TEXT_LENGTH = 1_000_000;

const name = z.string().min(1).max(64);
export const clockSchema = z
  .string()
  .max(96)
  .regex(/^\d{13}-\d{6}-[a-z0-9]+$/i);
export const sqlValueSchema = z.union([z.string().max(MAX_TEXT_LENGTH), z.number(), z.null()]);
export const datasetSchema = z
  .string()
  .max(64)
  .regex(/^(own|share:[0-9a-f-]{36})$/);

export const changeSchema = z.object({
  dataset: datasetSchema,
  table: name,
  pk: z.string().min(1).max(512),
  /// The entity the row belongs to (see `TableScope`), for sharing.
  scope: z.string().max(128).nullable(),
  fields: z.record(name, sqlValueSchema),
  clocks: z.record(name, clockSchema),
  /// The clock each changed field had when the sender changed it, so the receiver
  /// tells an edit that saw the current value apart from a concurrent one.
  baseClocks: z.record(name, clockSchema),
  deletedClock: clockSchema.nullable(),
});
export type Change = z.infer<typeof changeSchema>;

export const pushRequestSchema = z.object({
  changes: z.array(changeSchema).max(MAX_PUSH_CHANGES),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/// Why the server refused a change. `invalid-value` (a value the database can't hold) and
/// `clock-skew` (a clock far ahead of the server's) are about this one change: the device
/// keeps its row and the change, and the others of the push go through.
export const rejectionSchema = z.enum([
  "forbidden",
  "invalid",
  "unknown-dataset",
  "invalid-value",
  "clock-skew",
]);
export const pushResultSchema = z.object({
  dataset: datasetSchema,
  table: name,
  pk: z.string(),
  status: z.enum(["applied", "rejected"]),
  reason: rejectionSchema.optional(),
});
export type PushResult = z.infer<typeof pushResultSchema>;
export const pushResponseSchema = z.object({ results: z.array(pushResultSchema) });
export type PushResponse = z.infer<typeof pushResponseSchema>;

export const pullRequestSchema = z.object({
  /// The last sequence number seen per dataset; a dataset not listed starts at 0.
  cursors: z.record(datasetSchema, z.number().int().min(0)),
  limit: z.number().int().min(1).max(MAX_PULL_RECORDS).optional(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

export const syncRecordSchema = z.object({
  table: name,
  pk: z.string(),
  scope: z.string().nullable(),
  fields: z.record(name, sqlValueSchema),
  clocks: z.record(name, clockSchema),
  deletedClock: clockSchema.nullable(),
  seq: z.number().int(),
});
export type SyncRecord = z.infer<typeof syncRecordSchema>;

export const roleSchema = z.enum(["owner", "editor", "viewer"]);
export type Role = z.infer<typeof roleSchema>;

export const pulledDatasetSchema = z.object({
  dataset: datasetSchema,
  role: roleSchema,
  records: z.array(syncRecordSchema),
  cursor: z.number().int(),
  hasMore: z.boolean(),
});
export type PulledDataset = z.infer<typeof pulledDatasetSchema>;

export const pullResponseSchema = z.object({
  datasets: z.array(pulledDatasetSchema),
  /// Datasets the account no longer has, like a share that was revoked.
  removed: z.array(datasetSchema),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

/// Which of a device's rows the server doesn't hold, for checking a first sync
/// before it is called done.
export const MAX_MISSING_KEYS = 1000;
export const missingRequestSchema = z.object({
  table: name,
  pks: z.array(z.string().min(1).max(512)).max(MAX_MISSING_KEYS),
});
export type MissingRequest = z.infer<typeof missingRequestSchema>;
export const missingResponseSchema = z.object({ missing: z.array(z.string()) });

/// Live updates over a WebSocket. The client signs in with its first message, the
/// server tells it when a dataset has changes, and the client pulls them over HTTP
/// and acknowledges the cursor it reached.
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), token: z.string().max(4096) }),
  z.object({ type: z.literal("ack"), dataset: datasetSchema, cursor: z.number().int().min(0) }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("changes"), dataset: datasetSchema }),
  z.object({ type: z.literal("datasets") }),
  /// The account itself changed (its email was confirmed): devices read it again.
  z.object({ type: z.literal("account") }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), code: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/// What makes a change about a real row of a real table: the table syncs, every
/// field is one of its synced columns, every field has a clock, and the key holds
/// the table's key columns. The schema checks above only check the types.
export function changeProblem(change: Change): string | null {
  const table = syncedTable(change.table);
  if (!table) return `unknown table ${change.table}`;
  const columns = new Set(syncedColumns(table));
  for (const field of Object.keys(change.fields)) {
    if (!columns.has(field)) return `unknown field ${change.table}.${field}`;
    if (change.clocks[field] === undefined) return `field ${field} has no clock`;
  }
  for (const field of Object.keys(change.clocks)) {
    if (!(field in change.fields)) return `clock for missing field ${field}`;
  }
  try {
    const key = decodePk(table, change.pk);
    if (Object.values(key).some((v) => v === null)) return "incomplete key";
    for (const [column, value] of Object.entries(key)) {
      if (column in change.fields && change.fields[column] !== value) return "key does not match";
    }
  } catch {
    return "unreadable key";
  }
  return null;
}

/// How far ahead of the server's time a change's clock may be. A device whose date is a
/// day off is wrong, and its clocks would beat every honest edit from then on.
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/// Whether `value` holds a NUL character, which Postgres can't store in text or JSON.
export const hasNul = (value: string | number | null): boolean =>
  value !== null && String(value).includes("\0");

/// The clock's time of day in milliseconds, or null when it isn't one.
const clockMillis = (clock: string): number | null => {
  const millis = Number(clock.slice(0, 13));
  return Number.isFinite(millis) ? millis : null;
};

/// Why one change can't be stored, apart from being malformed (`changeProblem`): a value
/// the database refuses, or a clock too far ahead. Null when it can.
export function changeRejection(change: Change, now: number): PushResult["reason"] | null {
  if (hasNul(change.pk) || hasNul(change.scope)) return "invalid-value";
  if (Object.values(change.fields).some(hasNul)) return "invalid-value";
  const clocks = [...Object.values(change.clocks), change.deletedClock].filter(
    (c): c is string => c !== null,
  );
  if (clocks.some((c) => (clockMillis(c) ?? 0) > now + MAX_CLOCK_SKEW_MS)) return "clock-skew";
  return null;
}

/// A conflict the server recorded: the same field changed on two devices without
/// either seeing the other. The newer value is in the record; this keeps the other.
export const serverConflictSchema = z.object({
  id: z.uuid(),
  table: z.string(),
  pk: z.string(),
  field: z.string().nullable(),
  losingValue: sqlValueSchema,
  losingClock: z.string().nullable(),
  winningClock: z.string().nullable(),
  createdAt: z.string(),
});
export type ServerConflict = z.infer<typeof serverConflictSchema>;
export const serverConflictsSchema = z.object({ conflicts: z.array(serverConflictSchema) });

/// A clash only one device saw (it pulled the other edit before sending its own), handed to
/// the server so every device offers it (DECISIONS.md D40).
export const conflictReportSchema = z.object({
  table: z.string().min(1).max(64),
  pk: z.string().min(1).max(512),
  field: z.string().min(1).max(64),
  losingValue: sqlValueSchema.refine((v) => !hasNul(v), "NUL character"),
  losingClock: z.string().min(1).max(128),
  winningClock: z.string().max(128).nullable(),
});
export type ConflictReport = z.infer<typeof conflictReportSchema>;
/// The server's entry for a reported clash, and whether someone already decided on it.
export const conflictReportedSchema = z.object({ id: z.uuid(), resolved: z.boolean() });
export type ConflictReported = z.infer<typeof conflictReportedSchema>;

/// A device that synced for the account, by the id that ends each of its clocks.
export const deviceNameSchema = z.object({
  deviceId: z.string(),
  name: z.string(),
  platform: z.string(),
  lastSeenAt: z.string(),
});
export type DeviceName = z.infer<typeof deviceNameSchema>;
export const devicesSchema = z.object({ devices: z.array(deviceNameSchema) });
