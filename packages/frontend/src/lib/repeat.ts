import { addDays, addMonths, addWeeks, addYears, parse } from "date-fns";
import type { Repeat } from "#/components/repeat-chip.tsx";

export const MAX_OCCURRENCES = 366;

export const DEFAULT_REPEAT: Repeat = {
  cadence: "none",
  endMode: "for",
  durationCount: 16,
  durationUnit: "weeks",
  until: "",
};

const CADENCE_STEPS = { daily: addDays, weekly: addWeeks, monthly: addMonths };
const DURATION_UNITS = {
  days: addDays,
  weeks: addWeeks,
  months: addMonths,
  years: addYears,
};

/// Where a series stops, exclusive: `start` plus the duration, or the day after
/// the `until` day. Null when `until` isn't a day yet.
function seriesEnd(start: Date, v: Repeat): Date | null {
  if (v.endMode === "for") return DURATION_UNITS[v.durationUnit](start, v.durationCount);
  const until = parse(v.until, "yyyy-MM-dd", new Date());
  return Number.isNaN(until.getTime()) ? null : addDays(until, 1);
}

/// Every date an item lands on, from `start` up to but not including `start` plus the
/// duration, or up to and including the `until` day. A missing or earlier `until` keeps
/// only the start.
export function repeatDates(start: Date, v: Repeat): Date[] {
  if (v.cadence === "none") return [start];
  const end = seriesEnd(start, v);
  if (!end || (v.endMode === "until" && end <= start)) return [start];
  const step = CADENCE_STEPS[v.cadence];
  const dates: Date[] = [];
  for (let i = 0; dates.length <= MAX_OCCURRENCES; i++) {
    const next = step(start, i);
    if (next >= end) break;
    dates.push(next);
  }
  return dates;
}

/// Why a series can't be created as picked, or null when it can.
export function repeatProblem(date: string, v: Repeat): string | null {
  if (v.cadence === "none" || v.endMode === "for") return null;
  if (!v.until) return "Pick a day to repeat until";
  return v.until < date ? "Repeat until a day on or after the start" : null;
}
