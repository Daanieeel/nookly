import type { Row, SqlValue } from "@nookly/shared/schema";
import type { BatchResult, SqlDriver, SqlStatement } from "@nookly/shared/sync";
import type { SQLiteDatabase } from "expo-sqlite";

/// A guard of the batch no longer held; thrown to roll the transaction back.
class Stale extends Error {
  readonly index: number;
  constructor(index: number) {
    super("stale");
    this.index = index;
  }
}

/// The shared engine and data layer on the phone's `expo-sqlite` database. A batch is
/// one exclusive transaction, so nothing else writes in between.
export function expoDriver(db: SQLiteDatabase): SqlDriver {
  return {
    query: (sql: string, params: SqlValue[]) => db.getAllAsync<Row>(sql, params),
    async batch(statements: SqlStatement[]): Promise<BatchResult> {
      try {
        await db.withExclusiveTransactionAsync(async (tx) => {
          for (const [index, statement] of statements.entries()) {
            if (statement.expect !== undefined) {
              const row = await tx.getFirstAsync<Row>(statement.sql, statement.params);
              const value = row ? (Object.values(row)[0] ?? null) : null;
              if (value !== statement.expect) throw new Stale(index);
            } else {
              await tx.runAsync(statement.sql, statement.params);
            }
          }
        });
        return { outcome: "done" };
      } catch (error) {
        if (error instanceof Stale) return { outcome: "stale", index: error.index };
        throw error;
      }
    },
  };
}
