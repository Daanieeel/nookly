import { DESKTOP_SCHEMA } from "../schema.ts";
import { type SqlStatement, ident } from "./sql.ts";

/// Every statement that builds a device database with the desktop's schema: the
/// synced tables, their indexes, and sync's own tables and triggers. The mobile app
/// creates its database from this, and tests their devices.
export function localSchemaStatements(): string[] {
  return [
    ...DESKTOP_SCHEMA.tables.flatMap((t) => [t.sql, ...t.indexes]),
    ...DESKTOP_SCHEMA.syncTables,
    ...DESKTOP_SCHEMA.syncIndexes,
    ...DESKTOP_SCHEMA.syncTriggers,
  ];
}

/// The rows a new device database starts with, as the desktop's migrations seed them.
export function seedStatements(): SqlStatement[] {
  return DESKTOP_SCHEMA.seeds.flatMap(({ table, rows }) =>
    rows.map((row) => {
      const columns = Object.keys(row);
      return {
        sql: `INSERT OR IGNORE INTO ${ident(table)} (${columns.map(ident).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        params: columns.map((c) => row[c] ?? null),
      };
    }),
  );
}
