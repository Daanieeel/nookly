import { format, isToday, isWeekend } from "date-fns";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { formatClock, formatWeekday } from "#/lib/datetime.ts";
import { cn } from "@nookly/ui/lib/utils";
import { ExternalEventBlock, ExternalEventChip } from "../external-calendars/ExternalEventBlock";
import { lanePosition } from "../external-calendars/overlay-layout";
import {
  DAY_MINUTES,
  type DayColumn,
  HOUR_PX,
  type MinuteRange,
  SCROLL_TO_HOUR,
  SNAP_MINUTES,
  type SlotRange,
  heightPxFor,
  isEmptySpot,
  minutesToTime,
  topPxFor,
} from "./calendar-model";
import { SessionBlock } from "./SessionBlock";

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/// Height of one all day row under the day headers.
const ALL_DAY_ROW_PX = 22;
/// All day rows shown before the strip stops growing; the rest scroll.
const MAX_ALL_DAY_ROWS = 3;

interface Drag {
  key: string;
  date: Date;
  anchor: number;
  current: number;
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

function dragRange(drag: Drag): MinuteRange {
  return {
    startMin: Math.min(drag.anchor, drag.current),
    endMin: Math.max(drag.anchor, drag.current) + SNAP_MINUTES,
  };
}

/// The Outlook style time grid behind the Day, Work week and Week views: the
/// whole day with hour and half hour lines. Dragging across empty time picks
/// a range for a new Session; a plain click picks the hour from that half hour.
export function TimeGrid({
  spaceId,
  columns,
  selection,
  highlightIds,
  onSelect,
  onPickDay,
}: {
  spaceId: string;
  columns: DayColumn[];
  /// The range a create dialog is open for, kept highlighted meanwhile.
  selection: SlotRange | null;
  highlightIds: Set<string>;
  onSelect: (range: SlotRange) => void;
  /// Opens one day on its own, from its header.
  onPickDay: (day: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const nowMinutes = useNowMinutes();
  const single = columns.length === 1;
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
            {columns.map(({ day, key, allDay }) => (
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
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex">
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

        {columns.map(({ day, key, items, lanes }) => {
          const range =
            drag?.key === key
              ? dragRange(drag)
              : selection && format(selection.date, "yyyy-MM-dd") === key
                ? selection
                : null;
          return (
            <div
              key={key}
              className={cn(
                "relative min-w-0 flex-1 touch-none border-l border-border select-none",
                isWeekend(day) && "bg-weekend",
              )}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if (!isEmptySpot(e.currentTarget, e.target, "[data-calendar-item]")) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const minutes = minutesAt(e);
                setDrag({ key, date: day, anchor: minutes, current: minutes, moved: false });
              }}
              onPointerMove={(e) => {
                if (drag?.key !== key) return;
                const minutes = minutesAt(e);
                if (minutes !== drag.current) setDrag({ ...drag, current: minutes, moved: true });
              }}
              onPointerUp={() => {
                if (drag?.key !== key) return;
                setDrag(null);
                if (drag.moved) {
                  onSelect({ date: day, ...dragRange(drag) });
                } else {
                  const startMin = Math.floor(drag.anchor / 30) * 30;
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
                  {...contextTarget("sessions.slot", {
                    startMin: i * 30,
                    startCreate: () =>
                      onSelect({
                        date: day,
                        startMin: i * 30,
                        endMin: Math.min(i * 30 + 60, DAY_MINUTES),
                      }),
                  })}
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
                return item.kind === "session" ? (
                  <SessionBlock
                    key={item.occurrence.entity.id}
                    spaceId={spaceId}
                    occurrence={item.occurrence}
                    position={position}
                    highlighted={highlightIds.has(item.occurrence.entity.id)}
                  />
                ) : (
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
