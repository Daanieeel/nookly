import {
  type Row,
  type SqlValue,
  type SyncedTable,
  SYNCED_TABLES,
  decodePk,
  syncedColumns,
  syncedTable,
} from "../schema.ts";
import { HybridClock } from "./hlc.ts";
import {
  type Change,
  MAX_PUSH_CHANGES,
  OWN_DATASET,
  type PulledDataset,
  type PushResult,
  type Role,
  type SyncRecord,
} from "./protocol.ts";
import { EMPTY_RECORD, type RecordState, findLosses, isAlive, mergeRecords } from "./record.ts";
import {
  FOREIGN_KEYS,
  type SqlDriver,
  type SqlStatement,
  TABLE_ORDER,
  guard,
  ident,
  pkSql,
  run,
} from "./sql.ts";
import { z } from "zod";

/// The sync engine: everything between a device's SQLite database and the wire,
/// the same on every device. It reads the rows the triggers marked dirty and turns
/// them into changes (`collect`), records what the server took (`acknowledge`) and
/// merges what the server sends into the database (`apply`). See
/// docs/development/sync-protocol.md.
///
/// It never overwrites a change the user makes while it works: every batch it
/// writes carries guards on the dirty versions it planned with, and a batch whose
/// rows changed in between is planned again from fresh reads.

/// The server's last known state of a row, kept per device in `sync_rows`.
interface Base extends RecordState {
  dataset: string;
  scope: string | null;
}

interface LocalState {
  row: Row | null;
  base: Base | null;
  dirtyVersion: number | null;
  changedAt: number;
}

/// A change ready to push, with the dirty version it was read at.
export interface PlannedChange {
  change: Change;
  version: number;
}

export interface Conflict {
  id: string;
  table: string;
  pk: string;
  field: string | null;
  losingValue: SqlValue;
  losingClock: string | null;
  winningClock: string | null;
  createdAt: string;
}

/// What a conflict entry records: the losing value, and the clocks when known.
interface LostEdit {
  field: string | null;
  value: SqlValue;
  clock: string | null;
  winningClock: string | null;
}

interface PlannedRecord {
  statements: SqlStatement[];
  alive: boolean;
  conflicts: number;
}

interface ApplyPlan {
  statements: SqlStatement[];
  conflicts: number;
  entityIds: string[];
  floor: number;
}

interface KeyMatch {
  where: string;
  params: SqlValue[];
}

export interface ApplySummary {
  applied: number;
  conflicts: number;
  /// Records that couldn't be written yet (a row they point at hasn't arrived);
  /// kept and tried again on the next sync.
  parked: number;
}

export interface SyncEngineOptions {
  driver: SqlDriver;
  /// Rebuilds what the device derives from synced rows (search, mentions).
  afterApply?: (entityIds: string[]) => Promise<void>;
  now?: () => number;
  newId?: () => string;
}

const META = {
  enabled: "enabled",
  deviceId: "device_id",
  clockFloor: "clock_floor",
  parked: "parked",
  cursor: (dataset: string) => `cursor:${dataset}`,
  role: (dataset: string) => `role:${dataset}`,
};

const MAX_ATTEMPTS = 5;

const baseRowSchema = z.object({
  pk: z.string(),
  dataset: z.string(),
  scope: z.string().nullable(),
  fields: z.string(),
  clocks: z.string(),
  deleted_clock: z.string().nullable(),
});
const sqlValue = z.union([z.string(), z.number(), z.null()]);
const fieldsSchema = z.record(z.string(), sqlValue);

/// A field's losing value is JSON; a whole row's stays its JSON text, for showing.
function readLosingValue(field: SqlValue, stored: SqlValue): SqlValue {
  if (field === null || stored === null) return stored;
  try {
    return sqlValue.parse(JSON.parse(String(stored)));
  } catch {
    return stored;
  }
}
const clocksSchema = z.record(z.string(), z.string());
const dirtyRowSchema = z.object({
  tbl: z.string(),
  pk: z.string(),
  version: z.number(),
  changed_at: z.number(),
});
const parkedSchema = z.array(
  z.object({
    dataset: z.string(),
    record: z.object({
      table: z.string(),
      pk: z.string(),
      scope: z.string().nullable(),
      fields: fieldsSchema,
      clocks: clocksSchema,
      deletedClock: z.string().nullable(),
      seq: z.number(),
    }),
  }),
);
type Parked = z.infer<typeof parkedSchema>;

function readBase(row: z.infer<typeof baseRowSchema>): Base {
  return {
    dataset: row.dataset,
    scope: row.scope,
    fields: fieldsSchema.parse(JSON.parse(row.fields)),
    clocks: clocksSchema.parse(JSON.parse(row.clocks)),
    deletedClock: row.deleted_clock,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function requireTable(name: string): SyncedTable {
  const table = syncedTable(name);
  if (!table) throw new Error(`Not a synced table: ${name}`);
  return table;
}

/// Groups `items` by `key`, keeping their order (`Map.groupBy` isn't on every engine).
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/// The SQL that writes `fields` into a row, inserting it when missing. Columns the
/// row must have but `fields` lacks get a neutral value, so a partial record (a
/// stub of a shared Space) still fits.
function upsertRow(table: SyncedTable, pk: Row, fields: Row): SqlStatement {
  const synced = new Set(syncedColumns(table));
  const values: Row = { ...fields, ...pk };
  for (const column of table.columns) {
    if (!(column.name in values) && column.notNull && column.default === null) {
      values[column.name] =
        column.type.toUpperCase().includes("INT") || column.type === "REAL" ? 0 : "";
    }
  }
  const names = Object.keys(values).filter((n) => synced.has(n) || table.pk.includes(n));
  const updates = names.filter((n) => !table.pk.includes(n) && n in fields);
  const conflict = updates.length
    ? `DO UPDATE SET ${updates.map((n) => `${ident(n)} = excluded.${ident(n)}`).join(", ")}`
    : "DO NOTHING";
  return {
    sql: `INSERT INTO ${ident(table.name)} (${names.map(ident).join(", ")}) VALUES (${names.map(() => "?").join(", ")}) ON CONFLICT (${table.pk.map(ident).join(", ")}) ${conflict}`,
    params: names.map((n) => values[n] ?? null),
  };
}

function wherePk(table: SyncedTable, pk: Row): KeyMatch {
  return {
    where: table.pk.map((c) => `${ident(c)} = ?`).join(" AND "),
    params: table.pk.map((c) => pk[c] ?? null),
  };
}

function deleteRow(table: SyncedTable, pk: Row): SqlStatement {
  const { where, params } = wherePk(table, pk);
  return { sql: `DELETE FROM ${ident(table.name)} WHERE ${where}`, params };
}

function writeBase(table: string, pk: string, base: Base): SqlStatement {
  return run(
    `INSERT INTO sync_rows (tbl, pk, dataset, scope, fields, clocks, deleted_clock) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (tbl, pk) DO UPDATE SET dataset = excluded.dataset, scope = excluded.scope,
       fields = excluded.fields, clocks = excluded.clocks, deleted_clock = excluded.deleted_clock`,
    table,
    pk,
    base.dataset,
    base.scope,
    JSON.stringify(base.fields),
    JSON.stringify(base.clocks),
    base.deletedClock,
  );
}

const dirtyGuard = (table: string, pk: string, version: number | null) =>
  guard(version, "SELECT (SELECT version FROM sync_dirty WHERE tbl = ? AND pk = ?)", table, pk);

const clearDirty = (table: string, pk: string) =>
  run("DELETE FROM sync_dirty WHERE tbl = ? AND pk = ?", table, pk);

const setMeta = (key: string, value: string) =>
  run(
    "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );

export class SyncEngine {
  private readonly driver: SqlDriver;
  private readonly afterApply?: (entityIds: string[]) => Promise<void>;
  private readonly now: () => number;
  private readonly newId: () => string;
  private clock: HybridClock | null = null;

  constructor(options: SyncEngineOptions) {
    this.driver = options.driver;
    this.afterApply = options.afterApply;
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  private async meta(key: string): Promise<string | null> {
    const rows = await this.driver.query("SELECT value FROM sync_meta WHERE key = ?", [key]);
    const value = rows[0]?.value;
    return value === undefined || value === null ? null : String(value);
  }

  private async batch(statements: SqlStatement[]) {
    return this.driver.batch(statements);
  }

  async isEnabled(): Promise<boolean> {
    return (await this.meta(META.enabled)) !== null;
  }

  async deviceId(): Promise<string> {
    const id = await this.meta(META.deviceId);
    if (id) return id;
    const created = this.newId().replaceAll("-", "");
    await this.batch([setMeta(META.deviceId, created)]);
    return created;
  }

  private async hybridClock(): Promise<HybridClock> {
    if (!this.clock) {
      const floor = Number((await this.meta(META.clockFloor)) ?? 0);
      this.clock = new HybridClock(await this.deviceId(), floor);
    }
    return this.clock;
  }

  /// Turns sync on. Every row that exists so far becomes a change dated by its own
  /// timestamps (never "now"), so on a first sync with an account that already has
  /// data, the newer edit of each field wins and the older one is kept as a
  /// conflict. Nothing local is overwritten or dropped by turning sync on.
  async enable(): Promise<void> {
    if (await this.isEnabled()) return;
    await this.deviceId();
    const statements: SqlStatement[] = [];
    for (const table of SYNCED_TABLES) {
      const columns = new Set(table.columns.map((c) => c.name));
      const time = columns.has("updated_at")
        ? "updated_at"
        : columns.has("created_at")
          ? "created_at"
          : table.scope.kind === "column" && table.scope.column !== "id"
            ? `(SELECT updated_at FROM entities WHERE id = ${ident(table.name)}.${ident(table.scope.column)})`
            : null;
      const millis = time
        ? `COALESCE(CAST(ROUND((julianday(${time}) - 2440587.5) * 86400000.0) AS INTEGER), 0)`
        : "0";
      statements.push(
        run(
          `INSERT INTO sync_dirty (tbl, pk, changed_at) SELECT ?, ${pkSql(table)}, ${millis} FROM ${ident(table.name)} WHERE true ON CONFLICT (tbl, pk) DO NOTHING`,
          table.name,
        ),
      );
    }
    // Whatever place in a server's history this device remembers belongs to an account
    // it left; a new first sync reads the whole of the new one.
    statements.push(run("DELETE FROM sync_meta WHERE key LIKE 'cursor:%'"));
    statements.push(setMeta(META.enabled, "1"));
    await this.batch(statements);
  }

  /// Turns sync off and forgets what this device knew of the server. The data stays.
  async disable(): Promise<void> {
    await this.batch([
      run("DELETE FROM sync_meta WHERE key <> ?", META.deviceId),
      run("DELETE FROM sync_dirty"),
      run("DELETE FROM sync_rows"),
    ]);
    this.clock = null;
  }

  async cursors(): Promise<Record<string, number>> {
    const rows = await this.driver.query(
      "SELECT key, value FROM sync_meta WHERE key LIKE 'cursor:%'",
      [],
    );
    return Object.fromEntries(
      rows.map((r) => [String(r.key).slice("cursor:".length), Number(r.value)]),
    );
  }

  async pendingCount(): Promise<number> {
    const rows = await this.driver.query("SELECT COUNT(*) AS n FROM sync_dirty", []);
    return Number(rows[0]?.n ?? 0);
  }

  async conflicts(): Promise<Conflict[]> {
    const rows = await this.driver.query(
      "SELECT id, tbl, pk, field, losing_value, losing_clock, winning_clock, created_at FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC",
      [],
    );
    return rows.map((r) => ({
      id: String(r.id),
      table: String(r.tbl),
      pk: String(r.pk),
      field: r.field === null ? null : String(r.field),
      losingValue: readLosingValue(r.field ?? null, r.losing_value ?? null),
      losingClock: r.losing_clock === null ? null : String(r.losing_clock),
      winningClock: r.winning_clock === null ? null : String(r.winning_clock),
      createdAt: String(r.created_at),
    }));
  }

  /// A conflict entry. The losing value is stored as JSON, so a number comes back a number.
  private conflict(table: string, pk: string, loss: LostEdit): SqlStatement {
    return run(
      "INSERT INTO sync_conflicts (id, tbl, pk, field, losing_value, losing_clock, winning_clock, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      this.newId(),
      table,
      pk,
      loss.field,
      loss.field === null
        ? loss.value === null
          ? null
          : String(loss.value)
        : JSON.stringify(loss.value),
      loss.clock,
      loss.winningClock,
      new Date(this.now()).toISOString(),
    );
  }

  /// Puts an edit that lost back: a field gets its value again, a removed or undone
  /// row comes back whole. It is a new local edit, so it syncs like any other. Fails,
  /// keeping the conflict, when the row it belongs to is gone.
  async restoreConflict(id: string): Promise<void> {
    const [row] = await this.driver.query(
      "SELECT tbl, pk, field, losing_value FROM sync_conflicts WHERE id = ? AND resolved_at IS NULL",
      [id],
    );
    if (!row) return;
    const table = requireTable(String(row.tbl));
    const key = decodePk(table, String(row.pk));
    const stored = row.losing_value === null ? null : String(row.losing_value);
    const resolve = run(
      "UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?",
      new Date(this.now()).toISOString(),
      id,
    );
    if (row.field !== null) {
      const field = String(row.field);
      if (!syncedColumns(table).includes(field)) throw new Error(`Unknown field ${field}`);
      const { where, params } = wherePk(table, key);
      const value = sqlValue.parse(stored === null ? null : JSON.parse(stored));
      const result = await this.batch([
        guard(1, `SELECT COUNT(*) FROM ${ident(table.name)} WHERE ${where}`, ...params),
        run(`UPDATE ${ident(table.name)} SET ${ident(field)} = ? WHERE ${where}`, value, ...params),
        resolve,
      ]);
      if (result.outcome !== "done") throw new Error("The item this change belongs to is gone.");
      return;
    }
    const fields = fieldsSchema.parse(JSON.parse(stored ?? "{}"));
    const synced = new Set(syncedColumns(table));
    const kept = Object.fromEntries(Object.entries(fields).filter(([name]) => synced.has(name)));
    await this.batch([upsertRow(table, key, kept), resolve]);
  }

  /// Settles a conflict on a value the person chose, which may be either side or a
  /// mix of both: it becomes a new local edit that syncs like any other. Both
  /// versions stay in the log, marked decided. Fails, keeping the conflict, when the
  /// row it belongs to is gone.
  async resolveConflict(id: string, value: SqlValue): Promise<void> {
    const [row] = await this.driver.query(
      "SELECT tbl, pk, field FROM sync_conflicts WHERE id = ? AND resolved_at IS NULL",
      [id],
    );
    if (!row) return;
    if (row.field === null) throw new Error("This conflict has no single value to set.");
    const table = requireTable(String(row.tbl));
    const field = String(row.field);
    if (!syncedColumns(table).includes(field)) throw new Error(`Unknown field ${field}`);
    const { where, params } = wherePk(table, decodePk(table, String(row.pk)));
    const result = await this.batch([
      guard(1, `SELECT COUNT(*) FROM ${ident(table.name)} WHERE ${where}`, ...params),
      run(`UPDATE ${ident(table.name)} SET ${ident(field)} = ? WHERE ${where}`, value, ...params),
      run(
        "UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?",
        new Date(this.now()).toISOString(),
        id,
      ),
    ]);
    if (result.outcome !== "done") throw new Error("The item this change belongs to is gone.");
  }

  /// Sets one field of a row as a new local edit, for a conflict the server holds.
  async setField(table: string, pk: string, field: string, value: SqlValue): Promise<void> {
    const def = requireTable(table);
    if (!syncedColumns(def).includes(field)) throw new Error(`Unknown field ${field}`);
    const { where, params } = wherePk(def, decodePk(def, pk));
    const result = await this.batch([
      guard(1, `SELECT COUNT(*) FROM ${ident(def.name)} WHERE ${where}`, ...params),
      run(`UPDATE ${ident(def.name)} SET ${ident(field)} = ? WHERE ${where}`, value, ...params),
    ]);
    if (result.outcome !== "done") throw new Error("The item this change belongs to is gone.");
  }

  /// Marks a conflict as seen, keeping the newer value.
  async dismissConflict(id: string): Promise<void> {
    await this.batch([
      run(
        "UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?",
        new Date(this.now()).toISOString(),
        id,
      ),
    ]);
  }

  /// The rows, bases and dirty marks of `pks` in `table`.
  private async load(table: SyncedTable, pks: string[]): Promise<Map<string, LocalState>> {
    const states = new Map<string, LocalState>();
    for (const pk of pks)
      states.set(pk, { row: null, base: null, dirtyVersion: null, changedAt: 0 });
    for (const part of chunks(pks, 200)) {
      const list = JSON.stringify(part);
      const rows = await this.driver.query(
        `SELECT ${pkSql(table)} AS sync_pk, * FROM ${ident(table.name)} WHERE ${pkSql(table)} IN (SELECT value FROM json_each(?))`,
        [list],
      );
      for (const row of rows) {
        const { sync_pk: pk, ...values } = row;
        const state = states.get(String(pk));
        if (state) state.row = values;
      }
      const bases = await this.driver.query(
        "SELECT pk, dataset, scope, fields, clocks, deleted_clock FROM sync_rows WHERE tbl = ? AND pk IN (SELECT value FROM json_each(?))",
        [table.name, list],
      );
      for (const raw of bases) {
        const parsed = baseRowSchema.parse(raw);
        const state = states.get(parsed.pk);
        if (state) state.base = readBase(parsed);
      }
      const dirty = await this.driver.query(
        "SELECT tbl, pk, version, changed_at FROM sync_dirty WHERE tbl = ? AND pk IN (SELECT value FROM json_each(?))",
        [table.name, list],
      );
      for (const raw of dirty) {
        const parsed = dirtyRowSchema.parse(raw);
        const state = states.get(parsed.pk);
        if (state) {
          state.dirtyVersion = parsed.version;
          state.changedAt = parsed.changed_at;
        }
      }
    }
    return states;
  }

  /// The entity a row belongs to, for sharing (see `TableScope`).
  private async scopeOf(
    table: SyncedTable,
    row: Row | null,
    base: Base | null,
  ): Promise<string | null> {
    const scope = table.scope;
    if (scope.kind === "none") return null;
    if (!row) return base?.scope ?? null;
    const value = row[scope.column];
    if (value === null || value === undefined) return null;
    if (scope.kind === "column") return String(value);
    const parent = requireTable(scope.table);
    const found = await this.driver.query(
      `SELECT ${ident(scope.scopeColumn)} AS scope FROM ${ident(parent.name)} WHERE ${pkSql(parent)} = ?`,
      [value],
    );
    const owner = found[0]?.scope;
    return owner === undefined || owner === null ? (base?.scope ?? null) : String(owner);
  }

  /// The dataset a row new to sync goes to: the one of the entity it belongs to.
  private async datasetOf(scope: string | null): Promise<string> {
    if (!scope) return OWN_DATASET;
    const rows = await this.driver.query(
      "SELECT dataset FROM sync_rows WHERE tbl = 'entities' AND pk = ?",
      [scope],
    );
    const dataset = rows[0]?.dataset;
    return dataset === undefined || dataset === null ? OWN_DATASET : String(dataset);
  }

  /// The fields of `row` that differ from `base`: what the user changed locally.
  private changedFields(table: SyncedTable, row: Row, base: Base | null): string[] {
    const columns = syncedColumns(table);
    if (!base || !isAlive(base)) return columns;
    const changed = columns.filter(
      (c) => (row[c] ?? null) !== (base.fields[c] ?? null) || !(c in base.clocks),
    );
    return changed.length > 0 && table.merge === "record" ? columns : changed;
  }

  /// Local changes ready to push, parents before children. Dirty rows that turn out
  /// to hold nothing new are cleared on the way.
  async collect(limit = MAX_PUSH_CHANGES): Promise<PlannedChange[]> {
    if (!(await this.isEnabled())) return [];
    const order = SYNCED_TABLES.map((t, i) => `WHEN ${`'${t.name}'`} THEN ${i}`).join(" ");
    const dirty = (
      await this.driver.query(
        `SELECT tbl, pk, version, changed_at FROM sync_dirty ORDER BY CASE tbl ${order} ELSE 999 END, changed_at LIMIT ?`,
        [limit],
      )
    ).map((r) => dirtyRowSchema.parse(r));
    const clock = await this.hybridClock();
    const planned: PlannedChange[] = [];
    const empty: SqlStatement[] = [];
    for (const [tableName, rows] of groupBy(dirty, (d) => d.tbl)) {
      const table = syncedTable(tableName);
      if (!table) {
        for (const d of rows)
          empty.push(
            run(
              "DELETE FROM sync_dirty WHERE tbl = ? AND pk = ? AND version = ?",
              d.tbl,
              d.pk,
              d.version,
            ),
          );
        continue;
      }
      const states = await this.load(
        table,
        rows.map((d) => d.pk),
      );
      for (const d of rows) {
        const state = states.get(d.pk);
        if (!state) continue;
        const { row, base } = state;
        const forget = run(
          "DELETE FROM sync_dirty WHERE tbl = ? AND pk = ? AND version = ?",
          d.tbl,
          d.pk,
          d.version,
        );
        if (!row) {
          if (!base || !isAlive(base)) {
            empty.push(forget);
            continue;
          }
          planned.push({
            version: d.version,
            change: {
              dataset: base.dataset,
              table: table.name,
              pk: d.pk,
              scope: base.scope,
              fields: {},
              clocks: {},
              baseClocks: {},
              deletedClock: clock.stamp(d.changed_at),
            },
          });
          continue;
        }
        const changed = this.changedFields(table, row, base);
        if (changed.length === 0) {
          empty.push(forget);
          continue;
        }
        const stamp = clock.stamp(d.changed_at);
        const scope = await this.scopeOf(table, row, base);
        const fields: Row = {};
        const clocks: Record<string, string> = {};
        const baseClocks: Record<string, string> = {};
        for (const c of changed) {
          fields[c] = row[c] ?? null;
          clocks[c] = stamp;
          const known = base?.clocks[c];
          if (known) baseClocks[c] = known;
        }
        planned.push({
          version: d.version,
          change: {
            dataset: base?.dataset ?? (await this.datasetOf(scope)),
            table: table.name,
            pk: d.pk,
            scope,
            fields,
            clocks,
            baseClocks,
            deletedClock: null,
          },
        });
      }
    }
    if (empty.length > 0) await this.batch(empty);
    return planned;
  }

  /// Records what the server did with pushed changes. A taken change becomes part of
  /// the row's base. A refused one (a page shared read only) is undone locally, and
  /// the edit is kept as a conflict.
  async acknowledge(planned: PlannedChange[], results: PushResult[]): Promise<void> {
    const byKey = new Map(results.map((r) => [`${r.table}\u0000${r.pk}`, r]));
    const statements: SqlStatement[] = [];
    const refused: PlannedChange[] = [];
    for (const item of planned) {
      const { change } = item;
      const result = byKey.get(`${change.table}\u0000${change.pk}`);
      if (!result) continue;
      if (result.status === "rejected") {
        refused.push(item);
        continue;
      }
      const table = requireTable(change.table);
      const base = (await this.load(table, [change.pk])).get(change.pk)?.base ?? null;
      const merged = mergeRecords(base ?? EMPTY_RECORD, change);
      statements.push(
        writeBase(change.table, change.pk, {
          ...merged,
          dataset: change.dataset,
          scope: change.scope,
        }),
        run(
          "DELETE FROM sync_dirty WHERE tbl = ? AND pk = ? AND version = ?",
          change.table,
          change.pk,
          item.version,
        ),
      );
    }
    if (statements.length > 0) await this.batch(statements);
    for (const item of refused) await this.undo(item);
  }

  /// Puts a row back the way the server has it, keeping the refused edit as a conflict.
  private async undo(item: PlannedChange): Promise<void> {
    const { change } = item;
    const table = requireTable(change.table);
    const state = (await this.load(table, [change.pk])).get(change.pk);
    if (!state) return;
    const statements: SqlStatement[] = [
      dirtyGuard(change.table, change.pk, item.version),
      this.conflict(change.table, change.pk, {
        field: null,
        value: JSON.stringify(state.row ?? {}),
        clock: change.deletedClock ?? Object.values(change.clocks)[0] ?? null,
        winningClock: null,
      }),
    ];
    const key = decodePk(table, change.pk);
    if (state.base && isAlive(state.base))
      statements.push(upsertRow(table, key, state.base.fields));
    else statements.push(deleteRow(table, key));
    statements.push(clearDirty(change.table, change.pk));
    await this.batch(statements);
  }

  /// Merges pulled records into the database and moves each dataset's cursor, all
  /// in one transaction. Records that can't be written yet are parked and retried.
  async apply(datasets: PulledDataset[]): Promise<ApplySummary> {
    const incoming: Parked = [...(await this.parked())];
    for (const pulled of datasets) {
      for (const record of pulled.records) incoming.push({ dataset: pulled.dataset, record });
    }
    const meta: SqlStatement[] = datasets.flatMap((d) => [
      setMeta(META.cursor(d.dataset), String(d.cursor)),
      setMeta(META.role(d.dataset), d.role),
    ]);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const plan = await this.plan(incoming);
      try {
        const result = await this.batch([
          run("PRAGMA defer_foreign_keys = ON"),
          ...plan.statements,
          ...meta,
          setMeta(META.parked, "[]"),
          setMeta(META.clockFloor, String(plan.floor)),
        ]);
        if (result.outcome === "stale") continue;
        await this.finish(plan.entityIds);
        return { applied: incoming.length, conflicts: plan.conflicts, parked: 0 };
      } catch {
        return this.applyEach(incoming, meta);
      }
    }
    throw new Error("The data kept changing while sync applied changes; it will try again.");
  }

  /// One record at a time, after the whole batch failed: what fits is written, what
  /// doesn't (its parent hasn't arrived) waits for the next sync.
  private async applyEach(incoming: Parked, meta: SqlStatement[]): Promise<ApplySummary> {
    const parked: Parked = [];
    let conflicts = 0;
    const entityIds: string[] = [];
    for (const item of incoming) {
      const plan = await this.plan([item]);
      try {
        const result = await this.batch([
          run("PRAGMA defer_foreign_keys = ON"),
          ...plan.statements,
          setMeta(META.clockFloor, String(plan.floor)),
        ]);
        if (result.outcome === "stale") parked.push(item);
        else {
          conflicts += plan.conflicts;
          entityIds.push(...plan.entityIds);
        }
      } catch {
        parked.push(item);
      }
    }
    await this.batch([...meta, setMeta(META.parked, JSON.stringify(parked))]);
    await this.finish(entityIds);
    return { applied: incoming.length - parked.length, conflicts, parked: parked.length };
  }

  private async parked(): Promise<Parked> {
    const raw = await this.meta(META.parked);
    if (!raw) return [];
    try {
      return parkedSchema.parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async finish(entityIds: string[]) {
    await this.repairKeys();
    if (this.afterApply && entityIds.length > 0) await this.afterApply([...new Set(entityIds)]);
  }

  /// The statements that merge `incoming` into the database.
  private async plan(incoming: Parked): Promise<ApplyPlan> {
    const clock = await this.hybridClock();
    const guards: SqlStatement[] = [];
    const upserts: SqlStatement[] = [];
    const deletes: SqlStatement[] = [];
    const entityIds = new Set<string>();
    let conflicts = 0;
    const arriving = new Set(incoming.map((i) => `${i.record.table}\u0000${i.record.pk}`));
    const sorted = [...incoming].sort(
      (a, b) => (TABLE_ORDER.get(a.record.table) ?? 999) - (TABLE_ORDER.get(b.record.table) ?? 999),
    );
    for (const [tableName, items] of groupBy(sorted, (i) => i.record.table)) {
      const table = syncedTable(tableName);
      if (!table) continue;
      const states = await this.load(
        table,
        items.map((i) => i.record.pk),
      );
      for (const { dataset, record } of items) {
        const state = states.get(record.pk);
        if (!state) continue;
        for (const c of Object.values(record.clocks)) clock.observe(c);
        if (record.deletedClock) clock.observe(record.deletedClock);
        const planned = this.planRecord(table, dataset, record, state, clock);
        guards.push(dirtyGuard(table.name, record.pk, state.dirtyVersion));
        (planned.alive ? upserts : deletes).push(...planned.statements);
        conflicts += planned.conflicts;
        if (record.scope) entityIds.add(record.scope);
        if (!planned.alive) deletes.push(...(await this.cascade(table, record.pk, arriving)));
      }
    }
    // Parents are written first and deleted last; foreign keys are checked at the end.
    return {
      statements: [...guards, ...upserts, ...deletes.reverse()],
      conflicts,
      entityIds: [...entityIds],
      floor: clock.floor(),
    };
  }

  private planRecord(
    table: SyncedTable,
    dataset: string,
    record: SyncRecord,
    state: LocalState,
    clock: HybridClock,
  ): PlannedRecord {
    const base: RecordState = state.base ?? EMPTY_RECORD;
    const remote: RecordState = record;
    // What this device has that the server doesn't yet: the dirty fields, dated by
    // when they were changed.
    let local: RecordState = base;
    const pending = new Set<string>();
    let pendingDelete = false;
    if (state.dirtyVersion !== null) {
      if (state.row) {
        const stamp = clock.stamp(state.changedAt);
        const fields = { ...base.fields };
        const clocks = { ...base.clocks };
        for (const c of this.changedFields(table, state.row, state.base)) {
          fields[c] = state.row[c] ?? null;
          clocks[c] = stamp;
          pending.add(c);
        }
        local = { fields, clocks, deletedClock: base.deletedClock };
      } else if (state.base && isAlive(state.base)) {
        local = { ...base, deletedClock: clock.stamp(state.changedAt) };
        pendingDelete = true;
      }
    }
    const merged = mergeRecords(local, remote);
    const losses = findLosses(base, local, remote);
    const statements: SqlStatement[] = losses.map((loss) =>
      this.conflict(table.name, record.pk, loss),
    );
    const key = decodePk(table, record.pk);
    const alive = isAlive(merged);
    if (alive) statements.push(upsertRow(table, key, merged.fields));
    else if (state.row) statements.push(deleteRow(table, key));
    statements.push(
      writeBase(table.name, record.pk, {
        ...mergeRecords(base, remote),
        dataset,
        scope: record.scope,
      }),
    );
    const localWins =
      [...pending].some(
        (c) => merged.clocks[c] === local.clocks[c] && merged.clocks[c] !== remote.clocks[c],
      ) ||
      (pendingDelete && !alive);
    // A local edit that still beats the server stays dirty and is pushed next.
    if (!localWins) statements.push(clearDirty(table.name, record.pk));
    return { statements, alive, conflicts: losses.length };
  }

  /// Deleting a row removes the rows that point at it, as the device that deleted it
  /// did. Each one is kept as a conflict first, so nothing is lost unseen: one may
  /// have been added here while the other device deleted its parent.
  private async cascade(
    table: SyncedTable,
    pk: string,
    arriving: Set<string> = new Set(),
  ): Promise<SqlStatement[]> {
    if (table.pk.length !== 1) return [];
    const statements: SqlStatement[] = [];
    for (const fk of FOREIGN_KEYS.filter(
      (k) => k.parent === table.name && k.parentColumn === table.pk[0],
    )) {
      const child = requireTable(fk.table);
      const rows = await this.driver.query(
        `SELECT ${pkSql(child)} AS sync_pk, * FROM ${ident(child.name)} WHERE ${ident(fk.column)} = ?`,
        [pk],
      );
      for (const row of rows) {
        const { sync_pk: childPk, ...values } = row;
        const encoded = String(childPk);
        // A row the server sends along is handled by its own record.
        if (arriving.has(`${child.name}\u0000${encoded}`)) continue;
        statements.push(
          this.conflict(child.name, encoded, {
            field: null,
            value: JSON.stringify(values),
            clock: null,
            winningClock: null,
          }),
          ...(await this.cascade(child, encoded, arriving)),
          deleteRow(child, decodePk(child, encoded)),
        );
      }
    }
    return statements;
  }

  /// Two devices can give new entities the same key (TSK-14) while offline. The one
  /// created later (by time, then id) moves to the next free number; the change
  /// syncs like any edit, so every device ends up with the same keys.
  private async repairKeys(): Promise<void> {
    const duplicates = await this.driver.query(
      `SELECT e.id AS id, e.key_prefix AS prefix FROM entities e
       WHERE EXISTS (SELECT 1 FROM entities o WHERE o.key_prefix = e.key_prefix AND o.key_number = e.key_number
         AND (o.created_at < e.created_at OR (o.created_at = e.created_at AND o.id < e.id)))
       ORDER BY e.created_at, e.id`,
      [],
    );
    if (duplicates.length === 0) return;
    const statements: SqlStatement[] = duplicates.map((d) =>
      run(
        "UPDATE entities SET key_number = (SELECT MAX(key_number) + 1 FROM entities WHERE key_prefix = ?) WHERE id = ?",
        d.prefix ?? null,
        d.id ?? null,
      ),
    );
    await this.batch(statements);
  }

  /// Removes everything a dataset brought, once the account lost it (a share was
  /// revoked). Unsynced edits to it are kept as conflicts.
  async forget(dataset: string): Promise<void> {
    if (dataset === OWN_DATASET) return;
    const rows = await this.driver.query("SELECT tbl, pk FROM sync_rows WHERE dataset = ?", [
      dataset,
    ]);
    const sorted = [...rows].sort(
      (a, b) => (TABLE_ORDER.get(String(b.tbl)) ?? 0) - (TABLE_ORDER.get(String(a.tbl)) ?? 0),
    );
    const statements: SqlStatement[] = [run("PRAGMA defer_foreign_keys = ON")];
    for (const r of sorted) {
      const table = syncedTable(String(r.tbl));
      if (!table) continue;
      const pk = String(r.pk);
      const state = (await this.load(table, [pk])).get(pk);
      if (state?.dirtyVersion !== null && state?.row) {
        statements.push(
          this.conflict(table.name, pk, {
            field: null,
            value: JSON.stringify(state.row),
            clock: null,
            winningClock: null,
          }),
        );
      }
      statements.push(
        ...(await this.cascade(table, pk)),
        deleteRow(table, decodePk(table, pk)),
        clearDirty(table.name, pk),
      );
    }
    statements.push(
      run("DELETE FROM sync_rows WHERE dataset = ?", dataset),
      run("DELETE FROM sync_meta WHERE key IN (?, ?)", META.cursor(dataset), META.role(dataset)),
    );
    await this.batch(statements);
  }

  /// The role this account has for an entity that came from someone else's share,
  /// null for its own.
  async roleOf(entityId: string): Promise<Role | null> {
    const rows = await this.driver.query(
      "SELECT m.value AS role FROM sync_rows r JOIN sync_meta m ON m.key = 'role:' || r.dataset WHERE r.tbl = 'entities' AND r.pk = ? AND r.dataset <> ?",
      [entityId, OWN_DATASET],
    );
    const role = z.enum(["owner", "editor", "viewer"]).safeParse(rows[0]?.role);
    return role.success ? role.data : null;
  }

  /// The role this account has in each dataset it pulled.
  async roles(): Promise<Record<string, Role>> {
    const rows = await this.driver.query(
      "SELECT key, value FROM sync_meta WHERE key LIKE 'role:%'",
      [],
    );
    const role = z.enum(["owner", "editor", "viewer"]);
    return Object.fromEntries(
      rows.map((r) => [String(r.key).slice("role:".length), role.parse(r.value)]),
    );
  }
}
