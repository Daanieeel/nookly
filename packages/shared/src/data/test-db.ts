import { NodeSqliteDriver } from "../sync/testing/node-driver.ts";
import type { LocalDb } from "./db.ts";

/// A fresh in-memory database with the desktop's schema, and ids and times that count
/// up, for tests of the data functions.
export function testDb(): LocalDb {
  let clock = Date.parse("2026-10-14T09:00:00Z");
  let ids = 0;
  return {
    driver: new NodeSqliteDriver(),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    now: () => new Date((clock += 1000)),
  };
}
