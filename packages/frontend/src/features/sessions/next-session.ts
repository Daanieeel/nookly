import { toDay } from "#/features/tasks/task-model.ts";
import type { SessionOccurrence } from "#/lib/api/types.ts";

type Timed = Pick<SessionOccurrence, "date" | "startTime">;

/// Local `HH:MM`, the same shape as a Session's `startTime`.
function clockOf(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/// A Session has started once its start (local date and time) is at or before `now`.
/// Compared as strings, never through `new Date("YYYY-MM-DD")`, which reads as UTC.
export function hasStarted(session: Timed, now: Date): boolean {
  const today = toDay(now);
  return session.date < today || (session.date === today && session.startTime <= clockOf(now));
}

/// The Session that is running right now: today, started and not yet ended, not
/// cancelled. The earliest start wins when several overlap.
export function findCurrentSession<T extends Timed & { endTime: string; cancelled?: boolean }>(
  sessions: readonly T[],
  now: Date,
): T | undefined {
  const today = toDay(now);
  const clock = clockOf(now);
  return sessions
    .filter((s) => !s.cancelled && s.date === today && s.startTime <= clock && clock < s.endTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
}

/// The soonest Session that has not started and is not cancelled. A Session that is
/// underway or done never counts, even when it is still today.
export function findNextSession<T extends Timed & { cancelled?: boolean }>(
  sessions: readonly T[],
  now: Date,
): T | undefined {
  return sessions
    .filter((s) => !s.cancelled && !hasStarted(s, now))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
}
