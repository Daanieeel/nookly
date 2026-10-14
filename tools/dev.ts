/// Starts Nookly for development: the sync server (with a Postgres for it), the
/// desktop app and, unless only the desktop is asked for, the mobile app.
///
///   bun run dev           server, desktop and mobile
///   bun run dev:desktop   server and desktop
///   bun run dev:mobile    server and mobile
///   bun run dev:server    server alone
///   bun run dev:expo      the mobile app alone (not through this script)
///
/// The backend: `docker compose up` (Postgres and MinIO from the root
/// `docker-compose.yml`) when Docker runs, the server on the host with watch mode.
/// Without Docker: `DATABASE_URL` when set, else a local Postgres cluster in
/// `.dev/postgres` (`brew install postgresql`); files then don't sync, as there is
/// no S3. Without any, the server is skipped and the apps run on their own.
/// Settings come from `.env` (see `.env.example`), which Bun loads.
///
/// The mobile app keeps the terminal's keyboard, so Expo's keys (i for the iOS
/// simulator, a for Android, r to reload) work; the others' output is prefixed.

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Mode = "all" | "desktop" | "mobile" | "server";
const mode: Mode = ((): Mode => {
  const arg = process.argv[2] ?? "all";
  if (arg === "all" || arg === "desktop" || arg === "mobile" || arg === "server") return arg;
  console.error(`Unknown mode "${arg}". Use all, desktop, mobile or server.`);
  process.exit(1);
})();

const root = join(import.meta.dir, "..");
const children: Bun.Subprocess[] = [];
const cleanups: (() => Promise<void> | void)[] = [];

const COLORS = { server: 35, desktop: 36, postgres: 33 } as const;

/// Copies a process's output line by line, each line named after the process.
async function prefix(name: keyof typeof COLORS, stream: ReadableStream<Uint8Array>) {
  const tag = `\x1b[${COLORS[name]}m[${name}]\x1b[0m `;
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) process.stdout.write(`${tag}${line}\n`);
  }
  if (rest) process.stdout.write(`${tag}${rest}\n`);
}

function start(
  name: keyof typeof COLORS,
  cmd: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, FORCE_COLOR: "1", ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  void prefix(name, child.stdout);
  void prefix(name, child.stderr);
  children.push(child);
  return child;
}

async function run(cmd: string[]): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(cmd, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { ok: (await proc.exited) === 0, out: out + err };
}

const has = (bin: string) => Bun.which(bin) !== null;

interface Backend {
  databaseUrl: string;
  /// S3 settings for the server, when MinIO runs.
  s3: Record<string, string>;
}

const env = (name: string, fallback: string) => process.env[name] ?? fallback;

/// Postgres and MinIO for the server.
async function backend(): Promise<Backend | null> {
  if (has("docker") && (await run(["docker", "info"])).ok) {
    const up = await run(["docker", "compose", "up", "-d", "--wait", "postgres", "minio"]);
    if (!up.ok) throw new Error(`docker compose failed:\n${up.out}`);
    const user = env("POSTGRES_USER", "nookly");
    const port = env("POSTGRES_PORT", "5433");
    console.log(
      `\x1b[${COLORS.postgres}m[postgres]\x1b[0m Postgres on ${port}, MinIO on ${env("MINIO_PORT", "9000")} (console ${env("MINIO_CONSOLE_PORT", "9001")})`,
    );
    return {
      databaseUrl:
        process.env.DATABASE_URL ??
        `postgres://${user}:${env("POSTGRES_PASSWORD", "nookly")}@127.0.0.1:${port}/${env("POSTGRES_DB", "nookly")}`,
      s3: {
        S3_ENDPOINT: env("S3_ENDPOINT", `http://127.0.0.1:${env("MINIO_PORT", "9000")}`),
        S3_ACCESS_KEY_ID: env("S3_ACCESS_KEY_ID", "nookly"),
        S3_SECRET_ACCESS_KEY: env("S3_SECRET_ACCESS_KEY", "nookly-dev-secret"),
        S3_BUCKET: env("S3_BUCKET", "nookly"),
        S3_CREATE_BUCKET: "true",
      },
    };
  }
  if (process.env.DATABASE_URL) return { databaseUrl: process.env.DATABASE_URL, s3: {} };
  if (has("pg_ctl") && has("initdb")) {
    const dir = join(root, ".dev", "postgres");
    const port = "54329";
    if (!existsSync(join(dir, "PG_VERSION"))) {
      mkdirSync(dir, { recursive: true });
      const init = await run(["initdb", "-D", dir, "-U", "nookly", "--auth=trust", "-E", "UTF8"]);
      if (!init.ok) throw new Error(`initdb failed:\n${init.out}`);
    }
    const status = await run(["pg_ctl", "-D", dir, "status"]);
    if (!status.ok) {
      const started = await run([
        "pg_ctl",
        "-D",
        dir,
        "-o",
        // Quoted: pg_ctl hands these to a shell, and the path may hold spaces.
        `-p ${port} -k '${dir}' -h 127.0.0.1`,
        "-l",
        join(dir, "server.log"),
        "-w",
        "start",
      ]);
      if (!started.ok) throw new Error(`Postgres didn't start:\n${started.out}`);
      cleanups.push(async () => void (await run(["pg_ctl", "-D", dir, "-m", "fast", "stop"])));
    }
    // Ignores "already exists".
    await run(["createdb", "-h", "127.0.0.1", "-p", port, "-U", "nookly", "nookly"]);
    console.log(
      `\x1b[${COLORS.postgres}m[postgres]\x1b[0m local cluster in .dev/postgres on ${port}; no Docker, so no MinIO: files won't sync`,
    );
    return { databaseUrl: `postgres://nookly@127.0.0.1:${port}/nookly`, s3: {} };
  }
  return null;
}

async function stopAll(code = 0) {
  for (const child of children) child.kill("SIGTERM");
  await Promise.allSettled(children.map((c) => c.exited));
  for (const cleanup of cleanups) await cleanup();
  process.exit(code);
}
process.on("SIGINT", () => void stopAll());
process.on("SIGTERM", () => void stopAll());

let found: Backend | null = null;
let failure: string | null = null;
try {
  found = await backend();
} catch (error) {
  failure = String(error);
}
if (found) {
  const port = env("PORT", "3000");
  start("server", ["bun", "--watch", "src/index.ts"], join(root, "apps/server"), {
    ...found.s3,
    DATABASE_URL: found.databaseUrl,
    AUTH_SECRET: env("AUTH_SECRET", "development-only-secret-change-me-in-production-please"),
    PUBLIC_URL: env("PUBLIC_URL", `http://localhost:${port}`),
    PORT: port,
    MAILER: env("MAILER", "console"),
  });
  console.log(
    `Server on http://localhost:${port} (API docs at /docs). Sign in from the apps with that address; on the Android emulator use http://10.0.2.2:${port}.`,
  );
} else {
  console.log(
    failure
      ? `${failure}\nPostgres didn't start, so the sync server is skipped.`
      : "No Postgres found, so the sync server is skipped. Set DATABASE_URL, install Postgres, or start Docker.",
  );
}

const apps: Bun.Subprocess[] = [];
if (mode === "all" || mode === "desktop") {
  apps.push(start("desktop", ["bun", "run", "tauri", "dev"], join(root, "apps/desktop")));
}

if (mode === "all" || mode === "mobile") {
  const mobile = Bun.spawn(["bun", "run", "dev"], {
    cwd: join(root, "apps/mobile"),
    stdio: ["inherit", "inherit", "inherit"],
  });
  children.push(mobile);
  apps.push(mobile);
}

// Closing an app stops everything; the server restarts itself on changes. The
// server alone runs until Ctrl+C.
await (apps.length > 0 ? Promise.race(apps.map((c) => c.exited)) : children[0]?.exited);
await stopAll();
