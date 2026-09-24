import type { ExternalEvent } from "@/lib/api/externalCalendars";
import { zonedDayMinutes } from "@/lib/datetime";

const DAY_MINUTES = 24 * 60;

/// The part of a timed external event that falls on one day of the grid.
export interface EventSegment {
  event: ExternalEvent;
  startMin: number;
  endMin: number;
}

export interface DayEvents {
  timed: EventSegment[];
  allDay: ExternalEvent[];
}

/// Splits the events touching `day` (`YYYY-MM-DD`) into timed segments and all
/// day items. A timed event covering the whole day counts as all day there.
export function eventsForDay(events: ExternalEvent[], day: string): DayEvents {
  const timed: EventSegment[] = [];
  const allDay: ExternalEvent[] = [];
  for (const event of events) {
    if (event.allDay) {
      if (event.start <= day && day < event.end) allDay.push(event);
      continue;
    }
    const start = zonedDayMinutes(event.start);
    const end = zonedDayMinutes(event.end);
    if (start.day > day || end.day < day) continue;
    const startMin = start.day === day ? start.minutes : 0;
    const endMin = end.day === day ? end.minutes : DAY_MINUTES;
    // Ends exactly at this midnight: nothing of it shows today.
    if (start.day < day && endMin === 0) continue;
    if (startMin === 0 && endMin === DAY_MINUTES) allDay.push(event);
    else timed.push({ event, startMin, endMin });
  }
  return { timed, allDay };
}

export interface Lane {
  lane: number;
  lanes: number;
}

/// Side by side columns for overlapping items, like any calendar. `minLength`
/// is the shortest an item renders, so two short items that merely look
/// overlapping get their own columns too.
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

/// Where a block sits on its day column: pixels from the top and CSS lengths
/// across, keeping the grid's small gutter on both sides of each lane.
export interface BlockPosition {
  top: number;
  height: number;
  left: string;
  width: string;
}

export function lanePosition(top: number, height: number, { lane, lanes }: Lane): BlockPosition {
  const share = 100 / lanes;
  return {
    top,
    height,
    left: `calc(${lane * share}% + 3px)`,
    width: `calc(${share}% - 6px)`,
  };
}

/// Provider colors are only ever used as a tint; anything but a plain hex
/// color falls back to the muted foreground.
export function safeColor(color: string | null): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : "var(--muted-foreground)";
}
