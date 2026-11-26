import { afterAll, beforeAll, expect, it } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { connect, migrateDatabase } from "../src/db/client.ts";
import { HOOK_TIMEOUT } from "./helpers.ts";

// Accounts from before linked sign in providers: each sign in method gets the account's
// email, the earliest one becomes primary, and nothing else about the account changes.
const base = process.env.TEST_DATABASE_URL ?? "";
const name = `nookly_providers_${Date.now()}`;
const admin = postgres(base, { max: 1, onnotice: () => {} });
const url = base.replace(/\/[^/]+$/, `/${name}`);
/// The migrations a server had before this feature: 0000 to 0006.
const BEFORE = 7;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
}, HOOK_TIMEOUT);
afterAll(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}, HOOK_TIMEOUT);

function migrationsBefore(): string {
  const dir = mkdtempSync(join(tmpdir(), "nookly-migrations-"));
  cpSync(fileURLToPath(new URL("../drizzle", import.meta.url)), dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.slice(0, BEFORE);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

it(
  "gives every sign in method an email and every account a primary one",
  async () => {
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: migrationsBefore() });
    const user = async (username: string, email: string, verified: boolean) => {
      const id = crypto.randomUUID();
      await sql`INSERT INTO auth_user (id, name, username, email, email_verified)
      VALUES (${id}, ${username}, ${username}, ${email}, ${verified})`;
      return id;
    };
    const method = async (userId: string, provider: string, daysAgo: number) => {
      const password = provider === "credential" ? "hash" : null;
      await sql`INSERT INTO auth_account (id, user_id, provider_id, account_id, password, created_at)
      VALUES (${crypto.randomUUID()}, ${userId}, ${provider}, ${`${provider}-${userId}`}, ${password},
        now() - make_interval(days => ${daysAgo}))`;
    };
    const session = async (userId: string, token: string) => {
      await sql`INSERT INTO auth_session (id, user_id, token, expires_at)
      VALUES (${crypto.randomUUID()}, ${userId}, ${token}, now() + interval '1 day')`;
    };

    const password = await user("password", "ada@example.com", true);
    await method(password, "credential", 5);
    await session(password, "password-session");
    const both = await user("both", "grace@example.com", false);
    await method(both, "credential", 2);
    await method(both, "github", 9);
    await session(both, "both-session");
    const plain = await user("plain", "1234@users.nookly.invalid", false);
    await method(plain, "credential", 1);
    // Two addresses that differ only in case: only one of them can be a login email.
    const older = await user("older", "Case@example.com", true);
    await method(older, "credential", 3);
    const newer = await user("newer", "case@example.com", true);
    await method(newer, "credential", 3);
    await sql.end();

    const { sql: after, db } = connect(url);
    await migrateDatabase(db);
    const methods = await after`
    SELECT u.username, a.provider_id, a.email, a.email_verified, a.email_chosen, u.primary_provider
    FROM auth_account a JOIN auth_user u ON u.id = a.user_id
    ORDER BY u.username, a.provider_id`;
    const of = (username: string, provider: string) =>
      methods.find((m) => m.username === username && m.provider_id === provider);
    expect(of("password", "credential")).toMatchObject({
      email: "ada@example.com",
      email_verified: true,
      email_chosen: false,
      primary_provider: "credential",
    });
    expect(of("both", "github")).toMatchObject({
      email: "grace@example.com",
      email_verified: false,
      primary_provider: "github",
    });
    expect(of("both", "credential")).toMatchObject({
      email: "grace@example.com",
      primary_provider: "github",
    });
    expect(of("plain", "credential")).toMatchObject({
      email: null,
      email_verified: false,
      primary_provider: "credential",
    });
    const cased = [of("older", "credential")?.email, of("newer", "credential")?.email];
    expect(cased.filter((email) => email !== null)).toHaveLength(1);
    const sessions = await after`SELECT token, provider, reauthed_at, pending FROM auth_session
    ORDER BY token`;
    expect([...sessions]).toEqual([
      // Which method it came through isn't known for an account with two.
      { token: "both-session", provider: null, reauthed_at: null, pending: false },
      { token: "password-session", provider: "credential", reauthed_at: null, pending: false },
    ]);
    // Sessions that exist already are devices in use: however one ends, it stays on the
    // list, to be signed out there.
    await after`DELETE FROM auth_session WHERE token = 'both-session'`;
    const ended = await after`SELECT user_id IS NOT NULL AS owned, signed_out, token_hash
      FROM auth_ended_session`;
    expect([...ended]).toEqual([
      {
        owned: true,
        signed_out: false,
        token_hash: new Bun.CryptoHasher("sha256").update("both-session").digest("hex"),
      },
    ]);
    const emails = await after`SELECT username, email FROM auth_user ORDER BY username`;
    expect(emails).toHaveLength(5);
    await after.end();
  },
  HOOK_TIMEOUT,
);
