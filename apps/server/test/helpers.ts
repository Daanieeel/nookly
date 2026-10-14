import { ApiClient, type DeviceInfo, type TokenStore } from "@nookly/shared/api";
import { SyncClient, SyncEngine, type SyncStatus } from "@nookly/shared/sync";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { connect, migrateDatabase } from "../src/db/client.ts";
import { createLogger } from "../src/log.ts";
import { MemoryMailer } from "../src/mail/mailer.ts";
import { BlobStore } from "../src/storage/blobs.ts";
import { BunSqliteDriver } from "./bun-driver.ts";

export class MemoryTokens implements TokenStore {
  token: string | null = null;
  async load() {
    return this.token;
  }
  async save(token: string | null) {
    this.token = token;
  }
}

export const DESKTOP: DeviceInfo = { name: "MacBook", platform: "macos" };
export const PHONE: DeviceInfo = { name: "iPhone", platform: "ios" };
export const PASSWORD = "correct horse battery";

/// A running server on a random port, on the test database, with every table emptied.
export async function startServer(
  env: Record<string, string> = {},
  options: { databaseUrl?: string; reset?: boolean } = {},
) {
  const url = options.databaseUrl ?? process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set; the preload starts Postgres");
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: url,
    AUTH_SECRET: "test-secret-that-is-long-enough-for-signing-sessions",
    PUBLIC_URL: "http://nookly.test",
    RATE_LIMIT_SCALE: "1000",
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "error",
    // The MinIO from docker-compose.yml, in a bucket of its own.
    S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:9000",
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? "nookly",
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "nookly-dev-secret",
    S3_BUCKET: "nookly-test",
    ...env,
  });
  const lines: string[] = [];
  const log = createLogger(config.LOG_LEVEL, (line) => {
    lines.push(line);
    if (process.env.TEST_LOG_LEVEL) console.log(line);
  });
  const { sql, db } = connect(url);
  await migrateDatabase(db);
  if (options.reset !== false)
    await sql`TRUNCATE auth_user, auth_verification, users, sessions, refresh_tokens, email_tokens, records, conflicts, shares, devices, blobs CASCADE`;
  const mailer = new MemoryMailer();
  const storage = new BlobStore(db, config, log);
  await storage.ensureBucket(3);
  const built = buildApp({ config, db, mailer, log, storage });
  built.app.listen({ port: 0, hostname: "127.0.0.1" });
  const port = built.app.server?.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    ...built,
    baseUrl,
    config,
    storage,
    mailer,
    sql,
    db,
    logs: lines,
    client(tokens = new MemoryTokens(), onSignedOut?: () => void) {
      return new ApiClient({ baseUrl, tokens, onSignedOut });
    },
    async stop() {
      await built.app.stop(true);
      await sql.end({ timeout: 1 });
    },
  };
}
export type TestServer = Awaited<ReturnType<typeof startServer>>;

/// The username a test account gets for an email: its local part.
export const usernameOf = (email: string) => email.split("@")[0];

/// Signs up with a username and an email, and confirms the email like a person
/// clicking the link.
export async function verifiedAccount(server: TestServer, email: string, device = DESKTOP) {
  const api = server.client();
  await api.signUp({ username: usernameOf(email), email, password: PASSWORD }, device);
  const link = server.mailer.link(email, "/v1/auth/verify-email");
  if (!link) throw new Error("no verification email");
  await fetch(link.replace("http://nookly.test", server.baseUrl));
  const user = await api.me();
  if (!user.emailVerified) throw new Error("the email wasn't confirmed");
  return { api, user };
}

/// An account with a username only.
export async function account(server: TestServer, username: string, device = DESKTOP) {
  const api = server.client();
  const user = await api.signUp({ username, password: PASSWORD }, device);
  return { api, user };
}

/// A device: its own database, the shared engine and the sync client on the API.
export function device(api: ApiClient) {
  const driver = new BunSqliteDriver();
  const engine = new SyncEngine({ driver });
  const statuses: SyncStatus[] = [];
  const client = new SyncClient({
    engine,
    transport: api.syncTransport(),
    onStatus: (s) => statuses.push(s),
    debounceMs: 50,
  });
  return { api, driver, engine, client, statuses };
}
export type Device = ReturnType<typeof device>;

export async function until(check: () => boolean | Promise<boolean>, what: string, ms = 5_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const now = () => new Date().toISOString();

export function addSpace(d: Device, id = "space-1") {
  d.driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES (?, 'Personal', 'blue', ?, ?)",
    id,
    now(),
    now(),
  );
}

export function addTask(d: Device, id: string, title: string, key = 1) {
  addSpace(d);
  d.driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 'space-1', 'task', ?, ?, ?, 'TSK', ?)",
    id,
    title,
    now(),
    now(),
    key,
  );
  d.driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES (?, 'todo')", id);
}

export function addPage(d: Device, id: string, title: string, blocks: string[]) {
  addSpace(d);
  d.driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 'space-1', 'note', ?, ?, ?, 'NOT', 1)",
    id,
    title,
    now(),
    now(),
  );
  blocks.forEach((content, i) => {
    d.driver.exec(
      "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?, ?, ?, 'paragraph', ?, ?, ?)",
      `${id}-b${i}`,
      id,
      i,
      content,
      now(),
      now(),
    );
  });
}

export const titleOf = (d: Device, id: string) =>
  d.driver.rows("SELECT title FROM entities WHERE id = ?", id)[0]?.title ?? null;

/// Hooks start and stop a server and its database, slow while other suites run.
export const HOOK_TIMEOUT = 30_000;

/// One full round on a device, as the client runs it, without the live socket.
export async function syncOnce(d: Device) {
  const transport = d.api.syncTransport();
  const pull = async () => {
    for (;;) {
      const response = await transport.pull({ cursors: await d.engine.cursors() });
      for (const gone of response.removed) await d.engine.forget(gone);
      await d.engine.apply(response.datasets);
      if (!response.datasets.some((x) => x.hasMore)) return;
    }
  };
  await pull();
  for (;;) {
    const planned = await d.engine.collect();
    if (planned.length === 0) break;
    await d.engine.acknowledge(
      planned,
      (await transport.push({ changes: planned.map((p) => p.change) })).results,
    );
  }
  await pull();
}
