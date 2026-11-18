/// <reference types="node" />
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import type { Row, SqlValue } from "../../schema.ts";
import { localSchemaStatements, seedStatements } from "../local-schema.ts";
import type { BatchResult, SqlDriver, SqlStatement } from "../sql.ts";

const params = (values: SqlValue[]): SQLInputValue[] => values;

function toValue(value: SQLOutputValue): SqlValue {
  if (value instanceof Uint8Array) return null;
  // SAFETY: big integers are off (`readBigInts` is false), so a number is a number.
  return value as SqlValue;
}

function toRow(raw: Record<string, SQLOutputValue>): Row {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, toValue(value)]));
}

/// A device database for tests, in memory, built like the desktop's.
export class NodeSqliteDriver implements SqlDriver {
  readonly db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON");
    for (const sql of localSchemaStatements()) this.db.exec(sql);
    for (const seed of seedStatements()) this.exec(seed.sql, ...seed.params);
  }

  exec(sql: string, ...values: SqlValue[]) {
    this.db.prepare(sql).run(...params(values));
  }

  rows(sql: string, ...values: SqlValue[]): Row[] {
    return this.db
      .prepare(sql)
      .all(...params(values))
      .map(toRow);
  }

  async query(sql: string, values: SqlValue[]): Promise<Row[]> {
    return this.rows(sql, ...values);
  }

  async batch(statements: SqlStatement[]): Promise<BatchResult> {
    this.db.exec("BEGIN");
    try {
      for (const [index, statement] of statements.entries()) {
        if (statement.expect !== undefined) {
          const row = this.db.prepare(statement.sql).get(...params(statement.params));
          const value = row ? toValue(Object.values(row)[0] ?? null) : null;
          if (value !== statement.expect) {
            this.db.exec("ROLLBACK");
            return { outcome: "stale", index };
          }
        } else {
          this.db.prepare(statement.sql).run(...params(statement.params));
        }
      }
      this.db.exec("COMMIT");
      return { outcome: "done" };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
