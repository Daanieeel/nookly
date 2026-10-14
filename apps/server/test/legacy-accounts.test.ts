import { afterAll, beforeAll, expect, it } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { connect, migrateDatabase } from "../src/db/client.ts";
import { PASSWORD, PHONE, startServer } from "./helpers.ts";

// Accounts made before better-auth keep their id, data and password: a database at
// the first migration, with an account and a synced row, is migrated to now.
const base = process.env.TEST_DATABASE_URL ?? "";
const name = `nookly_legacy_${Date.now()}`;
const admin = postgres(base, { max: 1, onnotice: () => {} });
const url = base.replace(/\/[^/]+$/, `/${name}`);

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
});
afterAll(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

/// The migrations folder as it was with only its first migration.
function firstMigrationOnly(): string {
  const dir = mkdtempSync(join(tmpdir(), "nookly-migrations-"));
  const source = fileURLToPath(new URL("../drizzle", import.meta.url));
  cpSync(source, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

it("moves accounts from before better-auth over, with their passwords and data", async () => {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: firstMigrationOnly() });
  const hash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });
  const [{ id }] = await sql`
    INSERT INTO users (email, password_hash, email_verified_at)
    VALUES ('ada.lovelace@example.com', ${hash}, now()) RETURNING id`;
  await sql`
    INSERT INTO records (owner_id, tbl, pk, fields, clocks, seq)
    VALUES (${id}, 'task_statuses', 'todo', '{"name":"To do"}', '{"name":"1791934383689-000001-dev"}', 1)`;
  await sql.end();

  const { sql: after, db } = connect(url);
  await migrateDatabase(db);
  const [user] = await after`SELECT id, username, email, email_verified FROM auth_user`;
  expect(user).toEqual({
    id,
    username: "ada.lovelace",
    email: "ada.lovelace@example.com",
    email_verified: true,
  });
  await after.end();

  const server = await startServer({}, { databaseUrl: url, reset: false });
  try {
    const byEmail = await server.client().signIn("ada.lovelace@example.com", PASSWORD, PHONE);
    expect(byEmail.id).toBe(id);
    const byName = await server.client().signIn("ada.lovelace", PASSWORD, PHONE);
    expect(byName.id).toBe(id);
    const [kept] =
      await server.sql`SELECT fields->>'name' AS name FROM records WHERE owner_id = ${id}`;
    expect(kept.name).toBe("To do");
  } finally {
    await server.stop();
  }
});
