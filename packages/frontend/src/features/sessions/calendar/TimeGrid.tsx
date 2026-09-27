import { format, isToday, isWeekend } from "date-fns";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { formatClock, formatWeekday } from "#/lib/datetime.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  CalendarEntryBlock,
  CalendarEntryChip,
} from "../../calendar-entries/calendar/CalendarEntryBlock";
import { ExternalEventBlock, ExternalEventChip } from "../external-calendars/ExternalEventBlock";
import { lanePosition } from "../external-calendars/overlay-layout";
import {
  DAY_MINUTES,
  type DayColumn,
  type DayItem,
  HOUR_PX,
  SCROLL_TO_HOUR,
  SNAP_MINUTES,
  type SlotRange,
  daySpanFor,
  heightPxFor,
  isEmptySpot,
  minutesToTime,
  rangeForDay,
  topPxFor,
} from "./calendar-model";
import { SessionBlock } from "./SessionBlock";

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/// Height of one all day row under the day headers.
const ALL_DAY_ROW_PX = 22;
/// All day rows shown before the strip stops growing; the rest scroll.
const MAX_ALL_DAY_ROWS = 3;
/// The hour gutter's own width (`w-14`), subtracted from the row's width to
/// find which day column a drag's pointer is over.
const GUTTER_PX = 56;

/// `anchorCol`/`currentCol` are indexes into `columns`: equal for a same-day
/// drag (the only kind `allowMultiDay` false ever produces), different once a
/// drag crosses into another day column.
interface Drag {
  anchorCol: number;
  anchorMin: number;
  currentCol: number;
  currentMin: number;
  moved: boolean;
}

/// Minutes since midnight, ticking every minute, for the current time line.
function useNowMinutes(): number {
  const read = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(read()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes;
}

/// Resolves a drag in progress to the `SlotRange` it would create right now:
/// a single day when it never left its starting column, otherwise a span from
/// whichever end came first to whichever came last.
function dragToRange(drag: Drag, columns: DayColumn[]): SlotRange {
  const startCol = Math.min(drag.anchorCol, drag.currentCol);
  const endCol = Math.max(drag.anchorCol, drag.currentCol);
  if (startCol === endCol) {
    return {
      date: columns[startCol].day,
      startMin: Math.min(drag.anchorMin, drag.currentMin),
      endMin: Math.max(drag.anchorMin, drag.currentMin) + SNAP_MINUTES,
    };
  }
  const startIsAnchor = drag.anchorCol <= drag.currentCol;
  return {
    date: columns[startCol].day,
    startMin: startIsAnchor ? drag.anchorMin : drag.currentMin,
    endMin: Math.min(
      DAY_MINUTES,
      (startIsAnchor ? drag.currentMin : drag.anchorMin) + SNAP_MINUTES,
    ),
    endDate: columns[endCol].day,
  };
}

/// The Outlook style time grid behind the Day, Work week and Week views: the
/// whole day with hour and half hour lines. Dragging across empty time picks
/// a range for a new Session; a plain click picks the hour from that half hour.
export function TimeGrid({
  columns,
  selection,
  highlightIds,
  onSelect,
  onPickDay,
  slotCreateNoun,
  spaceColor,
  secondaryKind,
  allowMultiDay,
}: {
  columns: DayColumn[];
  /// The range a create dialog is open for, kept highlighted meanwhile.
  selection: SlotRange | null;
  highlightIds: Set<string>;
  onSelect: (range: SlotRange) => void;
  /// Opens one day on its own, from its header.
  onPickDay: (day: Date) => void;
  /// What a right-click on an empty slot offers to create ("Session" or
  /// "Calendar Entry"). Omitted (the unified cross-Space Calendar page) drops
  /// the right-click create action entirely, since that page has no creation
  /// surface of its own.
  slotCreateNoun?: "Session" | "Calendar Entry";
  /// Looks up a Space's accent color by id, to tint each block by its own
  /// origin Space instead of the default Session/Calendar Entry color — only
  /// the unified cross-Space Calendar page passes this.
  spaceColor?: (spaceId: string) => string | undefined;
  /// The item kind this module treats as secondary context (Sessions shown on
  /// the Calendar module page, or Calendar entries shown on the Sessions
  /// page): rendered with less visual weight than the module's own primary
  /// items, but still fully editable. Omitted on the unified cross-Space page,
  /// where Sessions and Calendar entries carry equal weight.
  secondaryKind?: DayItem["kind"];
  /// Lets a drag cross into another day column to create a multi-day Calendar
  /// entry (dragging from Monday noon to Wednesday 3pm, say). Off by default,
  /// so Sessions (always a single day) keep dragging exactly as before.
  allowMultiDay?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const nowMinutes = useNowMinutes();
  const single = columns.length === 1;
  // Passed to each item block so dragging it to a new place can resolve which
  // day it landed on.
  const days = columns.map((c) => c.day);
  const allDayRows = Math.min(
    MAX_ALL_DAY_ROWS,
    Math.max(0, ...columns.map((c) => c.allDay.length)),
  );
  const allDayHeightPx = allDayRows * ALL_DAY_ROW_PX + 4;

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_PX;
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drag]);

  const minutesAt = (e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = ((e.clientY - rect.top) / HOUR_PX) * 60;
    const snapped = Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(0, Math.min(snapped, DAY_MINUTES - SNAP_MINUTES));
  };

  /// Which day column `e` is currently over, by x position in the row — used
  /// while dragging, since pointer capture keeps delivering move events to the
  /// column the drag started on even once the cursor has left it.
  const columnAt = (e: ReactPointerEvent<HTMLElement>): number => {
    const rowRect = rowRef.current?.getBoundingClientRect();
    if (!rowRect) return 0;
    const usableWidth = rowRect.width - GUTTER_PX;
    const relX = e.clientX - rowRect.left - GUTTER_PX;
    const colWidth = usableWidth / columns.length;
    return Math.max(0, Math.min(columns.length - 1, Math.floor(relX / colWidth)));
  };

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-30 flex flex-col border-b border-border bg-card">
        <div className="flex">
          <div className="w-14 shrink-0" />
          {columns.map(({ day, key }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPickDay(day)}
              disabled={single}
              aria-label={`Open ${formatWeekday(day)} on its own`}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 border-l border-border py-2 text-xs text-muted-foreground enabled:hover:bg-accent/60",
                isWeekend(day) && "bg-weekend",
              )}
            >
              <span className="truncate">{formatWeekday(day, single ? "long" : "short")}</span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                  isToday(day)
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </button>
          ))}
        </div>
        {allDayRows > 0 && (
          <div
            className="flex h-(--all-day-height) border-t border-border"
            // SAFETY: a plain pixel length derived from the row count.
            style={{ "--all-day-height": `${allDayHeightPx}px` } as CSSProperties}
          >
            <div className="w-14 shrink-0 px-1.5 pt-1 text-right text-xs text-muted-foreground">
              All day
            </div>
            {columns.map(({ day, key, allDay, allDayCalendarEntries }) => (
              <div
                key={key}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto border-l border-border p-0.5",
                  isWeekend(day) && "bg-weekend",
                )}
              >
                {allDay.map((event) => (
                  <ExternalEventChip key={event.id} event={event} />
                ))}
                {allDayCalendarEntries.map((entry) => (
                  <CalendarEntryChip
                    key={entry.entity.id}
                    spaceId={entry.entity.spaceId}
                    entry={entry}
                    highlighted={highlightIds.has(entry.entity.id)}
                    accentColor={spaceColor?.(entry.entity.spaceId)}
                    secondary={secondaryKind === "calendarEntry"}
                    daySpan={daySpanFor(entry, day)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={rowRef} className="flex">
        <div className="w-14 shrink-0" aria-hidden>
          {HOURS.map((h) => (
            <div key={h} className="relative h-12">
              {h > 0 && (
                <span className="absolute -top-2 right-2 text-xs text-muted-foreground tabular-nums">
                  {formatClock(`${h}:00`)}
                </span>
              )}
            </div>
          ))}
        </div>

        {columns.map(({ day, key, items, lanes }, dayIndex) => {
          const active = drag ? dragToRange(drag, columns) : (selection ?? null);
          const range = active ? rangeForDay(day, active) : null;
          return (
            <div
              key={key}
              data-day-column
              className={cn(
                "relative min-w-0 flex-1 touch-none border-l border-border select-none",
                isWeekend(day) && "bg-weekend",
              )}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if (!isEmptySpot(e.currentTarget, e.target, "[data-calendar-item]")) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const minutes = minutesAt(e);
                setDrag({
                  anchorCol: dayIndex,
                  anchorMin: minutes,
                  currentCol: dayIndex,
                  currentMin: minutes,
                  moved: false,
                });
              }}
              onPointerMove={(e) => {
                if (!drag || drag.anchorCol !== dayIndex) return;
                const minutes = minutesAt(e);
                const currentCol = allowMultiDay ? columnAt(e) : dayIndex;
                if (minutes !== drag.currentMin || currentCol !== drag.currentCol) {
                  setDrag({ ...drag, currentMin: minutes, currentCol, moved: true });
                }
              }}
              onPointerUp={() => {
                if (!drag || drag.anchorCol !== dayIndex) return;
                setDrag(null);
                if (drag.moved) {
                  onSelect(dragToRange(drag, columns));
                } else {
                  const startMin = Math.floor(drag.anchorMin / 30) * 30;
                  onSelect({ date: day, startMin, endMin: Math.min(startMin + 60, DAY_MINUTES) });
                }
              }}
              onPointerCancel={() => setDrag(null)}
            >
              {HALF_HOURS.map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-6 border-b",
                    i % 2 === 0 ? "border-dashed border-border/50" : "border-border",
                  )}
                  {...(slotCreateNoun
                    ? contextTarget("calendar.slot", {
                        startMin: i * 30,
                        noun: slotCreateNoun,
                        startCreate: () =>
                          onSelect({
                            date: day,
                            startMin: i * 30,
                            endMin: Math.min(i * 30 + 60, DAY_MINUTES),
                          }),
                      })
                    : {})}
                />
              ))}

              {range && (
                <div
                  className="pointer-events-none absolute inset-x-0.5 top-(--sel-top) z-0 h-(--sel-height) rounded-md border border-primary bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary"
                  // SAFETY: plain pixel lengths computed from the picked range.
                  style={
                    {
                      "--sel-top": `${topPxFor(range.startMin)}px`,
                      "--sel-height": `${heightPxFor(range.startMin, range.endMin)}px`,
                    } as CSSProperties
                  }
                >
                  {formatClock(minutesToTime(range.startMin))} to{" "}
                  {formatClock(minutesToTime(range.endMin))}
                </div>
              )}

              {items.map((item) => {
                const position = lanePosition(
                  topPxFor(item.startMin),
                  heightPxFor(item.startMin, item.endMin),
                  lanes.get(item) ?? { lane: 0, lanes: 1 },
                );
                if (item.kind === "session") {
                  return (
                    <SessionBlock
                      key={item.occurrence.entity.id}
                      spaceId={item.occurrence.entity.spaceId}
                      occurrence={item.occurrence}
                      position={position}
                      highlighted={highlightIds.has(item.occurrence.entity.id)}
                      accentColor={spaceColor?.(item.occurrence.entity.spaceId)}
                      secondary={secondaryKind === "session"}
                      days={days}
                      dayIndex={dayIndex}
                    />
                  );
                }
                if (item.kind === "calendarEntry") {
                  return (
                    <CalendarEntryBlock
                      key={item.entry.entity.id}
                      spaceId={item.entry.entity.spaceId}
                      entry={item.entry}
                      position={position}
                      highlighted={highlightIds.has(item.entry.entity.id)}
                      accentColor={spaceColor?.(item.entry.entity.spaceId)}
                      secondary={secondaryKind === "calendarEntry"}
                      days={days}
                      dayIndex={dayIndex}
                    />
                  );
                }
                return (
                  <ExternalEventBlock key={item.event.id} event={item.event} position={position} />
                );
              })}

              {isToday(day) && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-(--now-top) z-20 h-0.5 bg-destructive"
                  // SAFETY: a plain pixel length computed from the current time.
                  style={{ "--now-top": `${topPxFor(nowMinutes)}px` } as CSSProperties}
                >
                  <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-destructive" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
