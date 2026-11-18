/// The status history the checker keeps (`scripts/status-check.ts`, every five minutes in
/// `.github/workflows/status.yml`) and the status page reads. One bucket per UTC day and
/// component, 90 days of them.

import { z } from "zod";

export const COMPONENTS = ["sync", "website", "downloads"] as const;
export type ComponentId = (typeof COMPONENTS)[number];

const daySchema = z.object({
  checks: z.number(),
  down: z.number(),
  slow: z.number(),
  ms: z.number(),
});
const lastCheckSchema = z.object({
  at: z.string(),
  ok: z.boolean(),
  ms: z.number(),
  version: z.string().nullable(),
});
const historySchema = z.object({
  days: z.record(z.string(), daySchema),
  last: lastCheckSchema.nullable(),
});

/// What the sync server's `/health` answers when it is well.
export const healthSchema = z.object({ status: z.literal("ok"), version: z.string() });

/// The stored history, as the checker writes it and the page reads it.
export const statusSchema = z.object({
  updatedAt: z.string().nullable(),
  components: z.partialRecord(z.enum(COMPONENTS), historySchema),
});

export type Day = z.infer<typeof daySchema>;
export type LastCheck = z.infer<typeof lastCheckSchema>;
export type ComponentHistory = z.infer<typeof historySchema>;
export type StatusData = z.infer<typeof statusSchema>;
export type CheckResult = { ok: boolean; ms: number; version?: string };
export type State = "up" | "degraded" | "down" | "unknown";

export const HISTORY_DAYS = 90;
/// A minute counts as five: the checker runs every five minutes.
export const CHECK_MINUTES = 5;
/// An answer slower than this counts as degraded.
export const SLOW_MS = 3000;

export function emptyStatus(): StatusData {
  return { updatedAt: null, components: {} };
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// The last `HISTORY_DAYS` days, oldest first, ending today (UTC).
export function lastDays(today: Date, count = HISTORY_DAYS): string[] {
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    days.push(dayKey(new Date(today.getTime() - i * 86_400_000)));
  }
  return days;
}

export function recordCheck(
  data: StatusData,
  id: ComponentId,
  result: CheckResult,
  now: Date,
): StatusData {
  const history = data.components[id] ?? { days: {}, last: null };
  const key = dayKey(now);
  const day = history.days[key] ?? { checks: 0, down: 0, slow: 0, ms: 0 };
  const answered = day.checks - day.down;
  const next: Day = {
    checks: day.checks + 1,
    down: day.down + (result.ok ? 0 : 1),
    slow: day.slow + (result.ok && result.ms > SLOW_MS ? 1 : 0),
    ms: result.ok ? Math.round((day.ms * answered + result.ms) / (answered + 1)) : day.ms,
  };
  const keep = new Set(lastDays(now));
  const days = Object.fromEntries(
    Object.entries({ ...history.days, [key]: next }).filter(([d]) => keep.has(d)),
  );
  const last: LastCheck = {
    at: now.toISOString(),
    ok: result.ok,
    ms: result.ms,
    version: result.version ?? null,
  };
  return {
    updatedAt: now.toISOString(),
    components: { ...data.components, [id]: { days, last } },
  };
}

export function dayState(day: Day | undefined): State {
  if (!day || day.checks === 0) return "unknown";
  const downShare = day.down / day.checks;
  if (downShare > 0.05) return "down";
  if (day.down > 0 || day.slow / day.checks > 0.05) return "degraded";
  return "up";
}

/// Percent of checks that got an answer, over the days there is history for.
export function uptime(history: ComponentHistory): number | null {
  let checks = 0;
  let down = 0;
  for (const day of Object.values(history.days)) {
    checks += day.checks;
    down += day.down;
  }
  return checks === 0 ? null : ((checks - down) / checks) * 100;
}

export type Incident = { day: string; component: ComponentId; minutes: number };

/// Every day a component missed checks, newest first.
export function incidents(data: StatusData): Incident[] {
  const list: Incident[] = [];
  for (const id of COMPONENTS) {
    for (const [day, d] of Object.entries(data.components[id]?.days ?? {})) {
      if (d.down > 0) list.push({ day, component: id, minutes: d.down * CHECK_MINUTES });
    }
  }
  return list.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
