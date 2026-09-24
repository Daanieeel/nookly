import { format, isSameMonth, isToday, isWeekend } from "date-fns";
import { formatWeekday } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { ExternalEventChip } from "../external-calendars/ExternalEventBlock";
import { type DayColumn, type SlotRange, isEmptySpot, weekNumber } from "./calendar-model";
import { SessionChip } from "./SessionBlock";

/// Where a Session created from a month cell starts, until the dialog changes it.
const DEFAULT_START_MIN = 9 * 60;

/// Whole weeks of the month at a glance. Weeks share the height while they fit
/// and grow to list every item otherwise, scrolling vertically. A cell lists its
/// Sessions and external events by time; clicking empty space in it starts a
/// Session on that day, and its day number opens the day on its own.
export function MonthGrid({
  anchor,
  columns,
  highlightIds,
  onSelect,
  spaceId,
  onPickDay,
}: {
  anchor: Date;
  columns: DayColumn[];
  highlightIds: Set<string>;
  onSelect: (range: SlotRange) => void;
  spaceId: string;
  onPickDay: (day: Date) => void;
}) {
  const weeks = Array.from({ length: Math.ceil(columns.length / 7) }, (_, i) =>
    columns.slice(i * 7, i * 7 + 7),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex shrink-0 border-b border-border bg-card">
        {columns.slice(0, 7).map(({ day, key }) => (
          <div
            key={key}
            className={cn(
              "min-w-0 flex-1 border-l border-border px-2 py-1.5 text-xs text-muted-foreground first:border-l-0",
              isWeekend(day) && "bg-weekend",
            )}
          >
            {formatWeekday(day, "short")}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].key} className="flex shrink-0 grow basis-32">
          <div className="grid min-w-0 flex-1 grid-cols-7">
            {week.map(({ day, key, items, allDay }, index) => {
              const entries = [
                ...allDay.map((event) => ({
                  id: event.id,
                  node: <ExternalEventChip event={event} />,
                })),
                ...items.map((item) =>
                  item.kind === "session"
                    ? {
                        id: item.occurrence.entity.id,
                        node: (
                          <SessionChip
                            occurrence={item.occurrence}
                            highlighted={highlightIds.has(item.occurrence.entity.id)}
                            spaceId={spaceId}
                          />
                        ),
                      }
                    : {
                        id: item.event.id,
                        node: <ExternalEventChip event={item.event} showTime />,
                      },
                ),
              ];
              return (
                <div
                  key={key}
                  className={cn(
                    "relative flex min-w-0 cursor-default flex-col gap-0.5 border-b border-l border-border p-1 first:border-l-0",
                    index === 0 && "pb-5",
                    isWeekend(day) && "bg-weekend",
                    !isSameMonth(day, anchor) && "text-muted-foreground",
                  )}
                  onClick={(e) => {
                    if (!isEmptySpot(e.currentTarget, e.target, "[data-calendar-item],button"))
                      return;
                    onSelect({
                      date: day,
                      startMin: DEFAULT_START_MIN,
                      endMin: DEFAULT_START_MIN + 60,
                    });
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onPickDay(day)}
                    aria-label={`Open ${formatWeekday(day)} ${format(day, "d")} on its own`}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center self-start rounded-full text-xs tabular-nums hover:bg-accent",
                      isToday(day) &&
                        "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                  {index === 0 && (
                    <span
                      className="pointer-events-none absolute bottom-1 left-1.5 text-xs text-muted-foreground tabular-nums"
                      title={`Week ${weekNumber(week.map((c) => c.day))}`}
                    >
                      W{weekNumber(week.map((c) => c.day))}
                    </span>
                  )}
                  {entries.map((entry) => (
                    <div key={entry.id} className="min-w-0">
                      {entry.node}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
