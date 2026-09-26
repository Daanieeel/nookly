import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { ExternalEvent } from "#/lib/api/externalCalendars.ts";
import type { CalendarEntry, SessionOccurrence } from "#/lib/api/types.ts";
import { formatMonth, formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import {
  type EventSegment,
  type Lane,
  eventsForDay,
  layoutLanes,
} from "../external-calendars/overlay-layout";

export type CalendarView = "day" | "workweek" | "week" | "month";
export type WeekStart = 0 | 1;

/// In Outlook's order, with the number key that switches to each.
export const CALENDAR_VIEWS = [
  { id: "day", label: "Day", key: "1" },
  { id: "workweek", label: "Work week", key: "2" },
  { id: "week", label: "Week", key: "3" },
  { id: "month", label: "Month", key: "4" },
] satisfies { id: CalendarView; label: string; key: string }[];

/// `storageKey` lets Sessions, the Calendar module and the unified Calendar
/// page each remember their own last picked view (see `STORAGE_KEYS`).
export function readView(storageKey: string = STORAGE_KEYS.sessionsView): CalendarView {
  const stored = preferences.get(storageKey);
  return CALENDAR_VIEWS.find((v) => v.id === stored)?.id ?? "week";
}

export function writeView(view: CalendarView, storageKey: string = STORAGE_KEYS.sessionsView) {
  preferences.set(storageKey, view);
}

/// Pixels per hour on the time grid; each half hour row is exactly `h-6`.
export const HOUR_PX = 48;
/// Dragging snaps to quarter hours, fine enough for 8:15 to 9:45 lectures.
export const SNAP_MINUTES = 15;
/// The hour the time grid opens scrolled to.
export const SCROLL_TO_HOUR = 7;
export const DAY_MINUTES = 24 * 60;
const MIN_BLOCK_PX = 18;
/// The shortest span a block renders at, in minutes, for laying out columns.
const MIN_BLOCK_MINUTES = (MIN_BLOCK_PX / HOUR_PX) * 60;

export function dayKey(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/// The days a view shows around `anchor`. Month spans whole weeks.
export function visibleDays(view: CalendarView, anchor: Date, weekStartsOn: WeekStart): Date[] {
  const run = (start: Date, count: number) =>
    Array.from({ length: count }, (_, i) => addDays(start, i));
  switch (view) {
    case "day":
      return [anchor];
    case "workweek":
      return run(startOfWeek(anchor, { weekStartsOn: 1 }), 5);
    case "week":
      return run(startOfWeek(anchor, { weekStartsOn }), 7);
    case "month": {
      const first = startOfWeek(startOfMonth(anchor), { weekStartsOn });
      const last = endOfWeek(endOfMonth(anchor), { weekStartsOn });
      return run(first, Math.round((last.getTime() - first.getTime()) / 86_400_000));
    }
  }
}

export function stepAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === "day") return addDays(anchor, direction);
  if (view === "month") return addMonths(anchor, direction);
  return addWeeks(anchor, direction);
}

export function stepLabel(view: CalendarView, direction: 1 | -1): string {
  const unit = view === "day" ? "day" : view === "month" ? "month" : "week";
  return `${direction === 1 ? "Next" : "Previous"} ${unit}`;
}

export function rangeLabel(view: CalendarView, days: Date[], anchor: Date): string {
  if (view === "month") return formatMonth(anchor);
  if (view === "day") return `${formatWeekday(anchor)}, ${formatShortDate(anchor)}`;
  return `${formatShortDate(days[0])} to ${formatShortDate(days[days.length - 1])}`;
}

/// The ISO week number, as the sidebar shows it. Taken from the middle of a
/// run of days so weeks starting on Sunday still count as their ISO week.
export function weekNumber(days: Date[]): number {
  return getISOWeek(days[Math.floor((days.length - 1) / 2)]);
}

/// Whether a pointer event landed on the empty calendar surface itself, not on
/// an item matching `itemSelector`. Popovers render in a portal elsewhere in the
/// DOM but still bubble through React, so a click inside one must not count as
/// a click on the grid behind it.
export function isEmptySpot(
  container: Element,
  target: EventTarget,
  itemSelector: string,
): boolean {
  return target instanceof Element && container.contains(target) && !target.closest(itemSelector);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, DAY_MINUTES - 1));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function topPxFor(minutes: number): number {
  return (minutes / 60) * HOUR_PX;
}

export function heightPxFor(startMin: number, endMin: number): number {
  return Math.max(MIN_BLOCK_PX, ((endMin - startMin) / 60) * HOUR_PX);
}

/// Minutes after midnight, end exclusive.
export interface MinuteRange {
  startMin: number;
  endMin: number;
}

/// A time range on one day, picked on the grid, that a new Session starts from.
export interface SlotRange extends MinuteRange {
  date: Date;
}

export type DayItem =
  | { kind: "session"; occurrence: SessionOccurrence; startMin: number; endMin: number }
  | { kind: "calendarEntry"; entry: CalendarEntry; startMin: number; endMin: number }
  | ({ kind: "external" } & EventSegment);

export interface DayColumn {
  day: Date;
  key: string;
  items: DayItem[];
  lanes: Map<DayItem, Lane>;
  allDay: ExternalEvent[];
  /// All-day calendar entries (no start/end time) on this day, shown in the
  /// same all-day strip as external all-day events.
  allDayCalendarEntries: CalendarEntry[];
}

/// Sessions, calendar entries and external events per visible day, with
/// overlapping timed ones laid out side by side. External events stay a read
/// only overlay. `calendarEntries` defaults to empty so the Sessions-only
/// calendar (and vice versa for the Calendar module) never has to pass an
/// empty array explicitly.
export function buildColumns(
  days: Date[],
  sessions: SessionOccurrence[],
  externalEvents: ExternalEvent[],
  calendarEntries: CalendarEntry[] = [],
): DayColumn[] {
  return days.map((day) => {
    const key = dayKey(day);
    const { timed, allDay } = eventsForDay(externalEvents, key);
    const dayEntries = calendarEntries.filter((a) => a.date === key);
    const timedEntries = dayEntries.filter((a) => !a.allDay);
    const allDayCalendarEntries = dayEntries.filter((a) => a.allDay);
    const items: DayItem[] = [
      ...sessions
        .filter((s) => s.date === key)
        .map((occurrence) => ({
          kind: "session" as const,
          occurrence,
          startMin: timeToMinutes(occurrence.startTime),
          endMin: timeToMinutes(occurrence.endTime),
        })),
      ...timedEntries.map((entry) => ({
        kind: "calendarEntry" as const,
        entry,
        startMin: timeToMinutes(entry.startTime ?? "00:00"),
        endMin: timeToMinutes(entry.endTime ?? "23:59"),
      })),
      ...timed.map((segment) => ({ kind: "external" as const, ...segment })),
    ];
    items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    return {
      day,
      key,
      items,
      lanes: layoutLanes(items, MIN_BLOCK_MINUTES),
      allDay,
      allDayCalendarEntries,
    };
  });
}
