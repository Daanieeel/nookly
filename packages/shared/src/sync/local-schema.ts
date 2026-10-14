import { DESKTOP_SCHEMA } from "../schema.ts";
import { type SqlDriver, type SqlStatement, ident } from "./sql.ts";

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

/// `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`, and the same for indexes and triggers,
/// so building the database again leaves what is there alone.
function ifMissing(sql: string): string {
  return sql
    .replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ")
    .replace(
      /^CREATE (UNIQUE )?INDEX /i,
      (_, unique: string | undefined) => `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `,
    )
    .replace(/^CREATE TRIGGER /i, "CREATE TRIGGER IF NOT EXISTS ");
}

/// Creates or upgrades a device database to the desktop's schema without touching a
/// row: missing tables, indexes and triggers are created, missing columns added, the
/// seeded rows put in where missing. Sync's triggers are rebuilt, as they hold no data.
/// Runs on every launch; when the schema version already matches it only checks.
export async function ensureSchema(driver: SqlDriver): Promise<void> {
  const [version] = await driver.query("PRAGMA user_version", []);
  if (Number(version?.user_version ?? 0) === DESKTOP_SCHEMA.schemaVersion) return;
  const statements: SqlStatement[] = [];
  const add = (sql: string) => statements.push({ sql, params: [] });
  for (const table of DESKTOP_SCHEMA.tables) {
    const existing = new Set(
      (await driver.query("SELECT name FROM pragma_table_info(?)", [table.name])).map((r) =>
        String(r.name),
      ),
    );
    if (existing.size === 0) {
      add(ifMissing(table.sql));
    } else {
      for (const column of table.columns) {
        if (existing.has(column.name)) continue;
        const fallback =
          column.type.toUpperCase().includes("INT") || column.type.toUpperCase() === "REAL"
            ? "0"
            : "''";
        const value = column.default ?? (column.notNull ? fallback : null);
        add(
          `ALTER TABLE ${ident(table.name)} ADD COLUMN ${ident(column.name)} ${column.type}${column.notNull ? " NOT NULL" : ""}${value === null ? "" : ` DEFAULT ${value}`}`,
        );
      }
    }
    for (const index of table.indexes) add(ifMissing(index));
  }
  for (const sql of [...DESKTOP_SCHEMA.syncTables, ...DESKTOP_SCHEMA.syncIndexes])
    add(ifMissing(sql));
  for (const trigger of DESKTOP_SCHEMA.syncTriggers) {
    const name = /^CREATE TRIGGER (\w+)/i.exec(trigger)?.[1];
    if (name) add(`DROP TRIGGER IF EXISTS ${ident(name)}`);
    add(trigger);
  }
  statements.push(...seedStatements());
  add(`PRAGMA user_version = ${DESKTOP_SCHEMA.schemaVersion}`);
  const result = await driver.batch(statements);
  if (result.outcome !== "done") throw new Error("Couldn't prepare the database.");
}
