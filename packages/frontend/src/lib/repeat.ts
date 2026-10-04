import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import type { Repeat } from "#/components/repeat-chip.tsx";

export const MAX_OCCURRENCES = 366;

export const DEFAULT_REPEAT: Repeat = { cadence: "none", durationCount: 16, durationUnit: "weeks" };

const CADENCE_STEPS = { daily: addDays, weekly: addWeeks, monthly: addMonths };
const DURATION_UNITS = {
  days: addDays,
  weeks: addWeeks,
  months: addMonths,
  years: addYears,
};

/// Every date an item lands on, from `start` up to but not including `start` plus the duration.
export function repeatDates(start: Date, v: Repeat): Date[] {
  if (v.cadence === "none") return [start];
  const end = DURATION_UNITS[v.durationUnit](start, v.durationCount);
  const step = CADENCE_STEPS[v.cadence];
  const dates: Date[] = [];
  for (let i = 0; dates.length <= MAX_OCCURRENCES; i++) {
    const next = step(start, i);
    if (next >= end) break;
    dates.push(next);
  }
  return dates;
}
