import type { SqlValue } from "@nookly/shared/schema";
import { type ExpoDatabase, type ExpoTransaction, expoDriver } from "./expo-driver.ts";

/// expo-sqlite as it behaves on a device: each exclusive transaction gets a connection of
/// its own with no busy timeout, so one begun while another runs fails at once.
function deviceLikeDb() {
  let busy = false;
  const ran: string[] = [];
  const tx: ExpoTransaction = {
    getFirstAsync: async <T>(): Promise<T | null> => null,
    runAsync: async (sql: string, params: SqlValue[]) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      ran.push(`${sql} ${params.join(",")}`);
      return { changes: 1 };
    },
  };
  const db: ExpoDatabase = {
    getAllAsync: async <T>(): Promise<T[]> => [],
    withExclusiveTransactionAsync: async (task) => {
      if (busy) throw new Error("Error code 5: database is locked");
      busy = true;
      try {
        await task(tx);
      } finally {
        busy = false;
      }
    },
  };
  return { db, ran };
}

describe("the phone's database driver", () => {
  // Two writes at the same moment (sync bringing changes in while a page saves) failed with
  // "database is locked" on a device, losing one of them (12.1).
  it("runs writes that arrive together one after another, losing none", async () => {
    const { db, ran } = deviceLikeDb();
    const driver = expoDriver(db);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        driver.batch([{ sql: "UPDATE spaces SET name = ?", params: [`n${i}`] }]),
      ),
    );
    expect(results.every((r) => r.outcome === "done")).toBe(true);
    expect(ran).toHaveLength(5);
  });

  it("keeps writing after a batch that failed", async () => {
    const { db, ran } = deviceLikeDb();
    let calls = 0;
    const driver = expoDriver({
      ...db,
      withExclusiveTransactionAsync: async (task) => {
        calls += 1;
        if (calls === 1) throw new Error("disk full");
        return db.withExclusiveTransactionAsync(task);
      },
    });
    const first = driver.batch([{ sql: "A", params: [] }]);
    const second = driver.batch([{ sql: "B", params: [] }]);
    await expect(first).rejects.toThrow("disk full");
    await expect(second).resolves.toEqual({ outcome: "done" });
    expect(ran).toEqual(["B "]);
  });
});
