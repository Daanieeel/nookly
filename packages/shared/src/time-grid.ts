import { type WeekStart, addDaysTo, startOfWeek } from "./calendar-grid.ts";

/// What a calendar's time grid needs of an item: when it starts and ends. Days are
/// `YYYY-MM-DD`, times `HH:MM`. (`AgendaItem` fits.)
export interface GridItem {
  id: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

export const DAY_MINUTES = 24 * 60;
/// How long an item with a start and no end (an exam) is drawn, in minutes.
const DEFAULT_MINUTES = 60;

/// "09:30" as minutes since midnight, or null when it is no time.
export function minutesOf(time: string | null): number | null {
  const match = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < DAY_MINUTES ? minutes : null;
}

/// The part of a timed item that falls on one day.
export interface Segment<T extends GridItem = GridItem> {
  item: T;
  startMin: number;
  endMin: number;
}

/// An item's last day: its own for most, the end date for one spanning days.
const lastDay = (item: GridItem) => item.endDate ?? item.date;

/// What a day holds: pieces on the hours, and items for the strip above them.
export interface DayContent<T extends GridItem = GridItem> {
  timed: Segment<T>[];
  allDay: T[];
}

/// Splits what touches `day` into pieces placed on the hours and items for the strip above
/// them: all day items, items that have no time, and the whole days in the middle of an item
/// that spans several.
export function segmentsForDay<T extends GridItem>(items: T[], day: string): DayContent<T> {
  const timed: Segment<T>[] = [];
  const allDay: T[] = [];
  for (const item of items) {
    if (item.date > day || lastDay(item) < day) continue;
    const start = minutesOf(item.startTime);
    if (item.allDay || start === null) {
      allDay.push(item);
      continue;
    }
    const end = minutesOf(item.endTime);
    const first = item.date === day;
    const last = lastDay(item) === day;
    if (first && last) {
      // An end before the start runs past midnight; this day shows it until then.
      const stop = end === null ? start + DEFAULT_MINUTES : end > start ? end : DAY_MINUTES;
      timed.push({ item, startMin: start, endMin: Math.min(stop, DAY_MINUTES) });
    } else if (first) {
      timed.push({ item, startMin: start, endMin: DAY_MINUTES });
    } else if (last) {
      if (end !== null && end > 0) timed.push({ item, startMin: 0, endMin: end });
    } else {
      allDay.push(item);
    }
  }
  return { timed, allDay };
}

export interface Lane {
  lane: number;
  lanes: number;
}

/// Side by side columns for overlapping items. `minLength` is the shortest an item renders,
/// so two short items that merely look separate get their own columns too.
export function layoutLanes<T extends { startMin: number; endMin: number }>(
  items: T[],
  minLength: number,
): Map<T, Lane> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result = new Map<T, Lane>();
  let cluster: T[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) {
      const lane = result.get(item);
      if (lane) lane.lanes = laneEnds.length;
    }
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const end = Math.max(item.endMin, item.startMin + minLength);
    if (item.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    result.set(item, { lane, lanes: 1 });
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

/// Where a block sits in its day's column: pixels from midnight and the share of the
/// column's width, from the left.
export interface BlockGeometry {
  top: number;
  height: number;
  left: number;
  width: number;
}

export function blockGeometry(
  segment: { startMin: number; endMin: number },
  { lane, lanes }: Lane,
  hourPx: number,
  minHeightPx: number,
): BlockGeometry {
  const perMinute = hourPx / 60;
  return {
    top: segment.startMin * perMinute,
    height: Math.max(minHeightPx, (segment.endMin - segment.startMin) * perMinute),
    left: lane / lanes,
    width: 1 / lanes,
  };
}

/// The views of the time grid: a phone shows a day, three days or a week, an iPad the
/// desktop's day, work week and week.
export type GridView = "day" | "threeDay" | "workWeek" | "week";

/// The days a view shows around `anchor`.
export function daysOfView(view: GridView, anchor: string, weekStart: WeekStart): string[] {
  const run = (first: string, count: number) =>
    Array.from({ length: count }, (_, i) => addDaysTo(first, i));
  switch (view) {
    case "day":
      return [anchor];
    case "threeDay":
      return run(anchor, 3);
    case "workWeek":
      return run(startOfWeek(anchor, 1), 5);
    case "week":
      return run(startOfWeek(anchor, weekStart), 7);
  }
}
