import type { Row, SqlValue } from "../schema.ts";
import { entityType } from "../schema.ts";
import type { SqlDriver, SqlStatement } from "../sync/sql.ts";

/// Nookly's data, read and written straight in SQLite with the desktop's schema, for
/// clients without the desktop's Rust core (the mobile app). Each write does what the
/// desktop's own function of the same name does, so a row looks the same whichever
/// device made it, and syncs like one.
export interface LocalDb {
  driver: SqlDriver;
  newId(): string;
  now(): Date;
}

export const iso = (db: LocalDb) => db.now().toISOString();

export async function rows(db: LocalDb, sql: string, ...params: SqlValue[]): Promise<Row[]> {
  return db.driver.query(sql, params);
}

export async function first(
  db: LocalDb,
  sql: string,
  ...params: SqlValue[]
): Promise<Row | undefined> {
  return (await rows(db, sql, ...params))[0];
}

/// Runs statements in one transaction.
export async function write(db: LocalDb, statements: SqlStatement[]): Promise<void> {
  const result = await db.driver.batch(statements);
  if (result.outcome !== "done") throw new Error("The write was interrupted; try again.");
}

export const str = (value: SqlValue | undefined): string =>
  value === null || value === undefined ? "" : String(value);
export const optStr = (value: SqlValue | undefined): string | null =>
  value === null || value === undefined ? null : String(value);
export const num = (value: SqlValue | undefined): number => Number(value ?? 0);

export function keyPrefix(type: string): string {
  return entityType(type)?.keyPrefix ?? "ENT";
}

export function moduleKeys(type: string): string[] {
  return entityType(type)?.moduleKeys ?? [];
}
