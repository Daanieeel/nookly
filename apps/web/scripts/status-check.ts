/// Checks Nookly's services once and adds the answers to the status history the status
/// page reads. `.github/workflows/status.yml` runs it every five minutes and commits the
/// file to the `status-data` branch.
///
///   bun apps/web/scripts/status-check.ts <path to status.json>

import { readFile, writeFile } from "node:fs/promises";
import { RELEASES_URL, SITE_URL, SYNC_URL } from "../src/lib/site";
import {
  type CheckResult,
  COMPONENTS,
  type ComponentId,
  emptyStatus,
  healthSchema,
  recordCheck,
  type StatusData,
  statusSchema,
} from "../src/lib/status";

const TIMEOUT_MS = 10_000;

type Probe = { url: string; read: (response: Response) => Promise<CheckResult["version"]> };

/// What each component answers when it is well. A wrong answer counts as down.
const PROBES = {
  sync: {
    url: `${SYNC_URL}/health`,
    read: async (response) => healthSchema.parse(await response.json()).version,
  },
  website: { url: SITE_URL, read: async () => undefined },
  downloads: { url: `${RELEASES_URL}/latest/download/latest.json`, read: async () => undefined },
} satisfies Record<ComponentId, Probe>;

async function check(probe: Probe): Promise<CheckResult> {
  const started = performance.now();
  try {
    const response = await fetch(probe.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "nookly-status-check" },
    });
    const ms = Math.round(performance.now() - started);
    if (!response.ok) return { ok: false, ms };
    const version = await probe.read(response);
    return version === undefined ? { ok: true, ms } : { ok: true, ms, version };
  } catch (error) {
    console.warn(`${probe.url}: ${String(error)}`);
    return { ok: false, ms: Math.round(performance.now() - started) };
  }
}

async function load(path: string): Promise<StatusData> {
  try {
    return statusSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    // A missing file starts the history. A broken one is an error: never overwrite it.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyStatus();
    throw error;
  }
}

const path = process.argv[2];
if (!path) throw new Error("Usage: bun apps/web/scripts/status-check.ts <status.json>");

let data = await load(path);
const now = new Date();
const results = await Promise.all(COMPONENTS.map((id) => check(PROBES[id])));
COMPONENTS.forEach((id, i) => {
  // SAFETY: `results` has one entry per component, in the same order.
  const result = results[i]!;
  data = recordCheck(data, id, result, now);
  console.log(`${id}: ${result.ok ? "up" : "DOWN"} in ${result.ms} ms`);
});
await writeFile(path, `${JSON.stringify(data)}\n`);
