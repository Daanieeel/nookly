import { create } from "zustand";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { localeForTimezone } from "#/lib/timezone-countries.ts";
import { preferences } from "#/lib/preferences.ts";

/// How dates or times are written. `american` and `european` are fixed conventions
/// (12 hour, month first / 24 hour, day first); `timezone` follows the chosen time
/// zone's country.
export type FormatMode = "american" | "european" | "timezone";

export interface DateTimeSettings {
  /// An IANA zone like `Europe/Berlin`, or `"system"` to follow the OS.
  timezone: string;
  dateFormat: FormatMode;
  timeFormat: FormatMode;
}

const FORMAT_MODES: FormatMode[] = ["american", "european", "timezone"];

// A small fallback for engines without `Intl.supportedValuesOf`.
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/// Every IANA zone the runtime knows about.
export function listTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

/// The OS's own zone, like `Europe/Berlin`.
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function readMode(key: string): FormatMode {
  const stored = preferences.get(key);
  return FORMAT_MODES.find((m) => m === stored) ?? "timezone";
}

function readSettings(): DateTimeSettings {
  return {
    timezone: preferences.get(STORAGE_KEYS.timezone) ?? "system",
    dateFormat: readMode(STORAGE_KEYS.dateFormat),
    timeFormat: readMode(STORAGE_KEYS.timeFormat),
  };
}

/// The date and time preferences, per device like the theme. Subscribing to it
/// re-renders with the new format the moment a setting changes.
export const useDateTimeSettings = create<
  DateTimeSettings & { update: (patch: Partial<DateTimeSettings>) => void }
>((set) => ({
  ...readSettings(),
  update: (patch) => {
    if (patch.timezone) preferences.set(STORAGE_KEYS.timezone, patch.timezone);
    if (patch.dateFormat) preferences.set(STORAGE_KEYS.dateFormat, patch.dateFormat);
    if (patch.timeFormat) preferences.set(STORAGE_KEYS.timeFormat, patch.timeFormat);
    set(patch);
  },
}));

function settings(): DateTimeSettings {
  return useDateTimeSettings.getState();
}

/// The zone to pass to `Intl`: `undefined` lets it follow the OS live.
function timeZone(): string | undefined {
  const { timezone } = settings();
  return timezone === "system" ? undefined : timezone;
}

function localeFor(mode: FormatMode): string | undefined {
  if (mode === "american") return "en-US";
  if (mode === "european") return "en-GB";
  return localeForTimezone(timeZone() ?? systemTimezone());
}

/// `YYYY-MM-DD` as a local midnight, so a calendar day never shifts with the zone.
function asDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/// Only ISO timestamps are moved into the chosen zone. `Date` objects and
/// `YYYY-MM-DD` strings stand for local calendar days and wall clock times, which
/// must not shift.
function zoneFor(value: Date | string): string | undefined {
  if (value instanceof Date || /^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return timeZone();
}

/// A compact day with the month named: "Sep 28", "28 Sep" or the zone's own
/// wording. The year shows only when it isn't this one.
export function formatShortDate(value: Date | string, now = new Date()): string {
  const date = asDate(value);
  return new Intl.DateTimeFormat(localeFor(settings().dateFormat), {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    timeZone: zoneFor(value),
  }).format(date);
}

/// A full numeric date: `09/28/2026`, `28.09.2026` or the zone's own style.
export function formatDate(value: Date | string): string {
  const date = asDate(value);
  const mode = settings().dateFormat;
  const zone = zoneFor(value);
  if (mode === "timezone") {
    return new Intl.DateTimeFormat(localeFor(mode), { dateStyle: "medium", timeZone: zone }).format(
      date,
    );
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return mode === "american"
    ? `${get("month")}/${get("day")}/${get("year")}`
    : `${get("day")}.${get("month")}.${get("year")}`;
}

/// A clock time: `2:30 PM`, `14:30` or the zone's own style.
export function formatTime(value: Date | string): string {
  const mode = settings().timeFormat;
  return new Intl.DateTimeFormat(localeFor(mode), {
    hour: "numeric",
    minute: "2-digit",
    hour12: mode === "timezone" ? undefined : mode === "american",
    timeZone: zoneFor(value),
  }).format(asDate(value));
}

/// A bare `HH:mm` wall clock time, like a session's start, in the chosen format.
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(2000, 0, 1, h, m || 0);
  const mode = settings().timeFormat;
  return new Intl.DateTimeFormat(localeFor(mode), {
    hour: "numeric",
    minute: "2-digit",
    hour12: mode === "timezone" ? undefined : mode === "american",
  }).format(date);
}

/// Date and time together, for full timestamps like tooltips. Pass an ISO
/// string for an instant, so it shows in the chosen zone.
export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/// The weekday's name in the date format's language.
export function formatWeekday(value: Date | string, width: "short" | "long" = "long"): string {
  return new Intl.DateTimeFormat(localeFor(settings().dateFormat), {
    weekday: width,
    timeZone: zoneFor(value),
  }).format(asDate(value));
}

/// A month and year heading, like a calendar's "September 2026".
export function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat(localeFor(settings().dateFormat), {
    month: "long",
    year: "numeric",
  }).format(value);
}

export interface ZonedDayMinutes {
  day: string;
  minutes: number;
}

/// An instant's calendar day (`YYYY-MM-DD`) and minutes past midnight in the
/// chosen zone, for placing it on a day grid.
export function zonedDayMinutes(iso: string): ZonedDayMinutes {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timeZone(),
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
