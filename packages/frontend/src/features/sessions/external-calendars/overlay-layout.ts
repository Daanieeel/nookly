import type { Lane } from "@nookly/shared/time-grid";
import type { ExternalEvent } from "#/lib/api/externalCalendars.ts";
import { zonedDayMinutes } from "#/lib/datetime.ts";

export { type Lane, layoutLanes } from "@nookly/shared/time-grid";

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
