import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function connect(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

export type Database = ReturnType<typeof connect>["db"];

/// Runs every migration in `drizzle/` that hasn't run yet, in one transaction each.
export async function migrateDatabase(db: Database) {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
}
