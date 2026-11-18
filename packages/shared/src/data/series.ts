/// What sessions and calendar entries share (`db/series.rs`): the checks on dates and
/// times, and which fields of an occurrence were changed on it alone.

/// A field a series update writes to its occurrences, as its bit in an occurrence's
/// `overridden_fields`. The values are stored, so they never change.
export const FIELD = {
  startTime: 1,
  endTime: 2,
  location: 4,
  allDay: 8,
  description: 16,
} as const;

/// Bit for an occurrence whose title was edited on its own: a series rename reaches
/// every occurrence without it.
export const TITLE_OVERRIDE = 32;

type FieldBit = (typeof FIELD)[keyof typeof FIELD];

/// The new `overridden_fields` for an edit that sets a field from `before` to `after`,
/// where the series holds `series` (undefined for a one-off). Setting the field back to
/// the series value ends the override; changing it to anything else marks it; sending
/// the same value again changes nothing.
export function markOverride<T>(
  mask: number,
  field: FieldBit,
  before: T,
  after: T,
  series: T | undefined,
): number {
  if (series !== undefined && series === after) return mask & ~field;
  if (before !== after) return mask | field;
  return mask;
}

export function isClockTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function validateDate(field: string, date: string): void {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${field} must be a YYYY-MM-DD date`);
  }
}

/// `what` names the thing in the message ("a session"). An all day one needs no times.
export function validateTimes(
  what: string,
  allDay: boolean,
  start: string | null,
  end: string | null,
): void {
  if (allDay) return;
  for (const time of [start, end]) {
    if (time !== null && !isClockTime(time)) {
      throw new Error(`Times must be HH:MM, 24-hour (got "${time}")`);
    }
  }
  if (start === null || end === null) {
    throw new Error("A start and an end time are needed unless it lasts all day.");
  }
  if (start >= end) throw new Error(`${what} has to end after it starts`);
}

export function validateDateRange(date: string, endDate: string | null): void {
  if (endDate !== null && endDate < date)
    throw new Error("A calendar entry can't end before it starts");
}
