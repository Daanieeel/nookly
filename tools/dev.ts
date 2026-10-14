/// Starts Nookly for development: the sync server (with a Postgres for it), the
/// desktop app and, unless only the desktop is asked for, the mobile app.
///
///   bun run dev           server, desktop and mobile
///   bun run dev:desktop   server and desktop
///   bun run dev:mobile    server and mobile
///   bun run dev:server    server alone
///
/// Postgres: `DATABASE_URL` when set, else a local cluster in `.dev/postgres` when the
/// Postgres binaries are installed (`brew install postgresql`), else the one from
/// `apps/server/docker-compose.yml` when Docker runs. Without any, the server is
/// skipped and the apps run on their own (sync is optional).
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

/// A Postgres for the server, and its address.
async function postgres(): Promise<string | null> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
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
      `\x1b[${COLORS.postgres}m[postgres]\x1b[0m local cluster in .dev/postgres on ${port}`,
    );
    return `postgres://nookly@127.0.0.1:${port}/nookly`;
  }
  if (has("docker") && (await run(["docker", "info"])).ok) {
    const compose = join(root, "apps/server/docker-compose.yml");
    const up = await run(["docker", "compose", "-f", compose, "up", "-d", "--wait", "postgres"]);
    if (!up.ok) throw new Error(`docker compose failed:\n${up.out}`);
    console.log(`\x1b[${COLORS.postgres}m[postgres]\x1b[0m in Docker on 5432`);
    return "postgres://nookly:nookly@127.0.0.1:5432/nookly";
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

let databaseUrl: string | null = null;
let failure: string | null = null;
try {
  databaseUrl = await postgres();
} catch (error) {
  failure = String(error);
}
if (databaseUrl) {
  start("server", ["bun", "--watch", "src/index.ts"], join(root, "apps/server"), {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: process.env.JWT_SECRET ?? "development-only-secret-change-me-in-production-please",
    PUBLIC_URL: process.env.PUBLIC_URL ?? "http://localhost:3000",
    MAILER: "console",
  });
  console.log(
    "Sync server on http://localhost:3000 (API docs at /docs). Sign in from the apps with that address; on the Android emulator use http://10.0.2.2:3000.",
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
  const mobile = Bun.spawn(["bun", "run", "start"], {
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
