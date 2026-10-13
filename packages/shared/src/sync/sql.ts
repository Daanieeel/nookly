import type { Row, SqlValue, SyncedTable } from "../schema.ts";
import { SYNCED_TABLES } from "../schema.ts";

/// What the sync engine needs from a SQLite database. The desktop passes it to Rust
/// (`sync_query`, `sync_batch`), the mobile app to `expo-sqlite`, tests to an
/// in-memory database.
export interface SqlStatement {
  sql: string;
  params: SqlValue[];
  /// Makes this a guard: the first column of the first row (null when there is
  /// none) must equal this, or nothing in the batch is written.
  expect?: SqlValue;
}

export type BatchResult = { outcome: "done" } | { outcome: "stale"; index: number };

export interface SqlDriver {
  query(sql: string, params: SqlValue[]): Promise<Row[]>;
  /// Runs every statement in one transaction; an error or a stale guard rolls all
  /// of it back.
  batch(statements: SqlStatement[]): Promise<BatchResult>;
}

export const run = (sql: string, ...params: SqlValue[]): SqlStatement => ({ sql, params });
export const guard = (expect: SqlValue, sql: string, ...params: SqlValue[]): SqlStatement => ({
  sql,
  params,
  expect,
});

/// A column or table name, quoted for SQL. Names only ever come from the exported
/// schema, never from input.
export const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;

/// SQL for a row's encoded key (see `encodePk`), matching what the triggers write.
export function pkSql(table: SyncedTable, alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  const columns = table.pk.map((c) => `${prefix}${ident(c)}`);
  return columns.length === 1 ? columns[0] : `json_array(${columns.join(", ")})`;
}

/// A table's foreign keys, read from its SQL: `column` points at `parent`'s `parentColumn`.
export interface ForeignKey {
  table: string;
  column: string;
  parent: string;
  parentColumn: string;
}

const REFERENCE = /^\s*(\w+)\s+[A-Z]+[^,]*?\bREFERENCES\s+"?(\w+)"?\s*\((\w+)\)/gim;

export function foreignKeys(table: SyncedTable): ForeignKey[] {
  const keys: ForeignKey[] = [];
  // Column definitions sit one per line, or after a comma.
  for (const part of table.sql.split(/[\n,]/)) {
    for (const match of part.matchAll(REFERENCE)) {
      keys.push({ table: table.name, column: match[1], parent: match[2], parentColumn: match[3] });
    }
  }
  return keys;
}

export const FOREIGN_KEYS: ForeignKey[] = SYNCED_TABLES.flatMap(foreignKeys);

/// Where each synced table sits in dependency order, parents first.
export const TABLE_ORDER = new Map(SYNCED_TABLES.map((t, i) => [t.name, i]));
