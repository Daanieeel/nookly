/// The pieces of a calendar that don't depend on a screen: where a week begins, and which
/// days a week, a month and its grid hold. Days are `YYYY-MM-DD`, as the data keeps them.

/// A weekday as `Date#getDay` counts it: Sunday is 0.
export type WeekStart = 0 | 1 | 6;

const DAYS = { monday: 1, sunday: 0, saturday: 6 } as const;

export type WeekStartSetting = "auto" | keyof typeof DAYS;

/// The first day of the week for a `calendar.weekStart` value. `auto` is `automatic`,
/// which each place picks for itself.
export function resolveWeekStart(setting: WeekStartSetting, automatic: WeekStart): WeekStart {
  return setting === "auto" ? automatic : DAYS[setting];
}

/// What `auto` means in calendars and date pickers: American weeks start on Sunday.
export function automaticWeekStart(dateFormat: string): WeekStart {
  return dateFormat === "american" ? 0 : 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

function format(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysTo(day: string, days: number): string {
  const [y, m, d] = parts(day);
  return format(new Date(y, m - 1, d + days));
}

export function addMonthsTo(day: string, months: number): string {
  const [y, m] = parts(day);
  return format(new Date(y, m - 1 + months, 1));
}

function weekdayOf(day: string): number {
  const [y, m, d] = parts(day);
  return new Date(y, m - 1, d).getDay();
}

/// The first day of the week `day` is in.
export function startOfWeek(day: string, weekStart: WeekStart): string {
  return addDaysTo(day, -((weekdayOf(day) - weekStart + 7) % 7));
}

/// The seven days of the week `day` is in.
export function weekDays(day: string, weekStart: WeekStart): string[] {
  const first = startOfWeek(day, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDaysTo(first, i));
}

export function firstOfMonth(day: string): string {
  const [y, m] = parts(day);
  return `${y}-${pad(m)}-01`;
}

/// Whole weeks covering the month `day` is in: five or six rows of seven days.
export function monthGrid(day: string, weekStart: WeekStart): string[][] {
  const first = firstOfMonth(day);
  const [y, m] = parts(first);
  const last = format(new Date(y, m, 0));
  const start = startOfWeek(first, weekStart);
  const weeks: string[][] = [];
  for (let cursor = start; cursor <= last; cursor = addDaysTo(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysTo(cursor, i)));
  }
  return weeks;
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
