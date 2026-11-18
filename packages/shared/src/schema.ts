import { z } from "zod";
import exported from "./generated/desktop-schema.json" with { type: "json" };

/// The desktop's schema, exported by the Rust test `sync::export_tests` from the
/// migrated database and the registries the CLI reads. Everything here follows from
/// registration on the desktop; nothing is written by hand.

/// A value in a synced column. Booleans are stored as 0 or 1, timestamps as text.
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("column"), column: z.string() }),
  z.object({
    kind: z.literal("via"),
    column: z.string(),
    table: z.string(),
    scopeColumn: z.string(),
  }),
]);

const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  notNull: z.boolean(),
  default: z.string().nullable(),
});

const tableSchema = z.object({
  name: z.string(),
  pk: z.array(z.string()).min(1),
  scope: scopeSchema,
  merge: z.enum(["field", "record"]),
  localColumns: z.array(z.string()),
  columns: z.array(columnSchema),
  sql: z.string(),
  indexes: z.array(z.string()),
});

const fieldKindSchema = z.union([
  z.string(),
  z.object({ type: z.literal("enum"), values: z.array(z.string()) }),
  z.object({ type: z.literal("entity_ref"), entityType: z.string() }),
]);

const entityTypeSchema = z.object({
  entityType: z.string(),
  description: z.string(),
  keyPrefix: z.string(),
  moduleKeys: z.array(z.string()),
  supportsBlocks: z.boolean(),
  fields: z.array(
    z.object({
      name: z.string(),
      kind: fieldKindSchema,
      description: z.string(),
      requiredOnCreate: z.boolean(),
      writableOnUpdate: z.boolean(),
    }),
  ),
  relationshipTypes: z.array(z.string()),
});

const relationshipTypeSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  inverseLabel: z.string().optional(),
});

const sqlValue = z.union([z.string(), z.number(), z.null()]);

const desktopSchema = z.object({
  schemaVersion: z.number().int(),
  tables: z.array(tableSchema),
  syncTables: z.array(z.string()),
  syncIndexes: z.array(z.string()),
  syncTriggers: z.array(z.string()),
  /// Rows the desktop's migrations seed, like the default task statuses.
  seeds: z.array(z.object({ table: z.string(), rows: z.array(z.record(z.string(), sqlValue)) })),
  entityTypes: z.array(entityTypeSchema),
  relationshipTypes: z.array(relationshipTypeSchema),
});

export type SyncedTable = z.infer<typeof tableSchema>;
export type TableScope = z.infer<typeof scopeSchema>;
export type EntityTypeDef = z.infer<typeof entityTypeSchema>;
export type DesktopSchema = z.infer<typeof desktopSchema>;

export const DESKTOP_SCHEMA: DesktopSchema = desktopSchema.parse(exported);

const TABLES = new Map(DESKTOP_SCHEMA.tables.map((t) => [t.name, t]));

/// Synced tables in dependency order: a row's parent table comes before it.
export const SYNCED_TABLES: SyncedTable[] = DESKTOP_SCHEMA.tables;

export function syncedTable(name: string): SyncedTable | undefined {
  return TABLES.get(name);
}

/// The columns of `table` that sync: every column but the device local ones.
export function syncedColumns(table: SyncedTable): string[] {
  return table.columns.map((c) => c.name).filter((name) => !table.localColumns.includes(name));
}

/// A row's key as the sync stores it: the value of a one column key, else a JSON array.
export function encodePk(table: SyncedTable, row: Row): string {
  const values = table.pk.map((column) => row[column] ?? null);
  return table.pk.length === 1 ? String(values[0]) : JSON.stringify(values);
}

const pkValuesSchema = z.array(sqlValue);

/// The key columns and values of an encoded key.
export function decodePk(table: SyncedTable, pk: string): Row {
  const values: SqlValue[] = table.pk.length === 1 ? [pk] : pkValuesSchema.parse(JSON.parse(pk));
  return Object.fromEntries(table.pk.map((column, i) => [column, values[i] ?? null]));
}

export function entityType(name: string): EntityTypeDef | undefined {
  return DESKTOP_SCHEMA.entityTypes.find((t) => t.entityType === name);
}
