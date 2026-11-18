import type { Row, SqlValue } from "@nookly/shared/schema";
import type { BatchResult, SqlDriver, SqlStatement } from "@nookly/shared/sync";

/// What the driver uses of an exclusive transaction of `expo-sqlite`.
export interface ExpoTransaction {
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
}

/// What the driver uses of an `expo-sqlite` database.
export interface ExpoDatabase {
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  withExclusiveTransactionAsync(task: (tx: ExpoTransaction) => Promise<void>): Promise<void>;
}

/// A guard of the batch no longer held; thrown to roll the transaction back.
class Stale extends Error {
  readonly index: number;
  constructor(index: number) {
    super("stale");
    this.index = index;
  }
}

/// The shared engine and data layer on the phone's `expo-sqlite` database. A batch is
/// one exclusive transaction, so nothing else writes in between. Batches run one after
/// another: `expo-sqlite` opens a connection of its own for each exclusive transaction,
/// with no busy timeout, so a second one begun while the first runs failed at once with
/// "database is locked" and its write was lost. Reads go on beside them (WAL).
export function expoDriver(db: ExpoDatabase): SqlDriver {
  let writing: Promise<void> = Promise.resolve();
  const inTurn = <T>(write: () => Promise<T>): Promise<T> => {
    const next = writing.then(write, write);
    writing = next.then(
      () => {},
      () => {},
    );
    return next;
  };
  return {
    query: (sql: string, params: SqlValue[]) => db.getAllAsync<Row>(sql, params),
    batch: (statements: SqlStatement[]) => inTurn(() => runBatch(db, statements)),
  };
}

async function runBatch(db: ExpoDatabase, statements: SqlStatement[]): Promise<BatchResult> {
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
}
