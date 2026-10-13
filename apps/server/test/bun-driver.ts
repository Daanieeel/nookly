import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { Row, SqlValue } from "@nookly/shared/schema";
import {
  type BatchResult,
  type SqlDriver,
  type SqlStatement,
  localSchemaStatements,
  seedStatements,
} from "@nookly/shared/sync";

const bind = (values: SqlValue[]): SQLQueryBindings[] => values;

/// A device database for tests, in memory, built like the desktop's.
export class BunSqliteDriver implements SqlDriver {
  readonly db = new Database(":memory:");

  constructor() {
    this.db.exec("PRAGMA foreign_keys = ON");
    for (const sql of localSchemaStatements()) this.db.exec(sql);
    for (const seed of seedStatements()) this.exec(seed.sql, ...seed.params);
  }

  exec(sql: string, ...values: SqlValue[]) {
    this.db.query(sql).run(...bind(values));
  }

  rows(sql: string, ...values: SqlValue[]): Row[] {
    // SAFETY: bun:sqlite returns plain objects of SQL values; no synced column is a blob.
    return this.db.query(sql).all(...bind(values)) as Row[];
  }

  async query(sql: string, values: SqlValue[]): Promise<Row[]> {
    return this.rows(sql, ...values);
  }

  async batch(statements: SqlStatement[]): Promise<BatchResult> {
    this.db.exec("BEGIN");
    try {
      for (const [index, statement] of statements.entries()) {
        if (statement.expect !== undefined) {
          const row = this.db.query(statement.sql).values(...bind(statement.params))[0];
          if ((row?.[0] ?? null) !== statement.expect) {
            this.db.exec("ROLLBACK");
            return { outcome: "stale", index };
          }
        } else {
          this.db.query(statement.sql).run(...bind(statement.params));
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
