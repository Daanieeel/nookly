import type { LocalDb } from "@nookly/shared/data";
import type { SQLiteDatabase } from "expo-sqlite";
import { ensureSchema } from "@nookly/shared/sync";
import { randomUUID } from "expo-crypto";
import { openDatabaseAsync } from "expo-sqlite";
import { expoDriver } from "./expo-driver.ts";

/// The phone's own database, with the desktop's schema. Everything works on it
/// offline; sync only copies rows in and out.
/// The phone's data layer, and the open database itself for a backup.
export type PhoneDb = LocalDb & { sqlite: SQLiteDatabase };

export async function openLocalDb(name = "nookly.db"): Promise<PhoneDb> {
  const db = await openDatabaseAsync(name);
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const driver = expoDriver(db);
  await ensureSchema(driver);
  return { driver, newId: randomUUID, now: () => new Date(), sqlite: db };
}
