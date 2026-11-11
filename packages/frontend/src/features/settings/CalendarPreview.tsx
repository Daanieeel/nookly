import { addDays, isToday, startOfWeek } from "date-fns";
import type { CSSProperties } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { formatClock, formatWeekday } from "#/lib/datetime.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { useWeekStartsOn } from "#/lib/week-start.ts";
import { useTodayStyle } from "#/features/sessions/calendar/today-style.ts";

/// Hours drawn, and how tall one is. A stretch of the day is enough to show the settings.
const HOURS = 6;
const HOUR_PX = 24;
const HEADER_PX = 40;
const DAYS = 7;

const hourLabel = (hour: number) => formatClock(`${String(hour).padStart(2, "0")}:00`);

/// A block of the given length starting on an hour of the preview.
function PreviewBlock({
  kind,
  minutes,
  startHour,
}: {
  kind: "session" | "entry";
  minutes: number;
  startHour: number;
}) {
  return (
    <div
      data-testid={`preview-${kind}`}
      data-minutes={minutes}
      className={cn(
        "absolute inset-x-0.5 top-(--top) h-(--height) rounded-xs border-l-2",
        kind === "session"
          ? "border-primary bg-primary/20"
          : "border-muted-foreground bg-muted-foreground/20",
      )}
      // SAFETY: `--top` and `--height` only ever receive pixel lengths worked out above.
      // `CSSProperties` just doesn't model custom properties.
      style={
        {
          "--top": `${startHour * HOUR_PX}px`,
          "--height": `${(minutes / 60) * HOUR_PX}px`,
        } as CSSProperties
      }
    />
  );
}

/// A small week drawn from the Calendar settings, so a change shows before leaving Settings:
/// the day the week starts on, where the hours open, how today is tinted, how long a new
/// session and calendar entry are, and how finely dragging snaps. Decoration only: the
/// controls under it say the same in words.
export function CalendarPreview() {
  const weekStartsOn = useWeekStartsOn();
  const today = useTodayStyle();
  const [dayStart] = useSetting("calendar.dayStartHour");
  const [snap] = useSetting("calendar.snapMinutes");
  const [sessionMinutes] = useSetting("calendar.sessionLengthMinutes");
  const [entryMinutes] = useSetting("calendar.calendarEntryLengthMinutes");

  const now = new Date();
  const first = startOfWeek(now, { weekStartsOn });
  const days = Array.from({ length: DAYS }, (_, i) => addDays(first, i));
  const todayIndex = days.findIndex((day) => isToday(day));

  // Near midnight the stretch backs up so it always shows a full run of hours.
  const firstHour = Math.min(dayStart, 24 - HOURS);
  const hours = Array.from({ length: HOURS }, (_, i) => firstHour + i);
  const ticksPerHour = Math.round(60 / snap);

  return (
    <div
      data-testid="calendar-preview"
      aria-hidden="true"
      className="relative flex overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="w-16 shrink-0">
        <div className="h-10" />
        {hours.map((hour) => (
          <div
            key={hour}
            data-testid="preview-hour"
            data-hour={hour}
            className="h-6 pr-1 text-right text-xs leading-none text-muted-foreground"
          >
            <span className="relative -top-1">{hourLabel(hour)}</span>
          </div>
        ))}
      </div>
      <div className="w-2 shrink-0">
        <div className="h-10" />
        {hours.map((hour) => (
          <div key={hour} className="flex h-6 flex-col justify-between">
            {Array.from({ length: ticksPerHour }, (_, i) => (
              <span
                key={i}
                data-testid="preview-snap-tick"
                className={cn("h-px bg-border", i === 0 ? "w-2" : "w-1")}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-7">
        {days.map((day, index) => {
          const isTodayColumn = index === todayIndex;
          return (
            <div
              key={day.toISOString()}
              data-testid="preview-day"
              data-weekday={day.getDay()}
              data-today={isTodayColumn ? "" : undefined}
              className={cn("border-l border-border", isTodayColumn && today.column)}
            >
              <div className="flex h-10 flex-col items-center justify-center gap-0.5 text-xs">
                <span className={cn("text-muted-foreground", isTodayColumn && today.label)}>
                  {formatWeekday(day, "short")}
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs",
                    isTodayColumn && today.pill,
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="relative h-36 overflow-hidden">
                {hours.map((hour) => (
                  <div key={hour} className="h-6 border-t border-border/60" />
                ))}
                {index === todayIndex && (
                  <PreviewBlock kind="session" minutes={sessionMinutes} startHour={1} />
                )}
                {index === (todayIndex + 1) % DAYS && (
                  <PreviewBlock kind="entry" minutes={entryMinutes} startHour={2} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        data-testid="preview-day-start"
        data-hour={dayStart}
        className="pointer-events-none absolute inset-x-0 top-(--top) border-t border-dashed border-primary"
        // SAFETY: `--top` only ever receives a pixel length worked out above.
        style={{ "--top": `${HEADER_PX + (dayStart - firstHour) * HOUR_PX}px` } as CSSProperties}
      >
        <span className="absolute right-1 -top-4 rounded-xs bg-card px-1 text-xs text-primary">
          Opens here
        </span>
      </div>
    </div>
  );
}
