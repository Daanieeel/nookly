import { IconCalendarWeek, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { Button } from "@nookly/ui/components/button";
import { listCalendarEntriesAll } from "#/lib/api/calendarEntries.ts";
import { listExternalEvents } from "#/lib/api/externalCalendars.ts";
import { listSessionsAll } from "#/lib/api/sessions.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  buildColumns,
  dayKey,
  rangeLabel,
  readView,
  stepAnchor,
  stepLabel,
  visibleDays,
  weekNumber,
  writeView,
} from "../sessions/calendar/calendar-model";
import { EXTERNAL_EVENTS_KEY } from "../sessions/external-calendars/external-calendar-sync";
import { MonthGrid } from "../sessions/calendar/MonthGrid";
import { TimeGrid } from "../sessions/calendar/TimeGrid";

/// The fifth cross-Space exception (`docs/04-navigation-spaces.md`): one
/// unified, space-neutral calendar layering the external overlay (bottom, read
/// only), every Space's Sessions, and every Space's Calendar entries (both
/// editable in place, via the same popovers their own per-Space calendars
/// use), each tinted by its origin Space's own accent color rather than any
/// single "active" Space's. It has no creation surface of its own — creating
/// a Session or Calendar entry still happens on its own Space's calendar;
/// this page is an additional vantage point, not a replacement.
export function UnifiedCalendarView() {
  const [view, setViewState] = useState<CalendarView>(() => readView(STORAGE_KEYS.calendarView));
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStartsOn = useDateTimeSettings((s) => (s.dateFormat === "american" ? 0 : 1));

  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    writeView(next, STORAGE_KEYS.calendarView);
  }, []);

  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const spaceColorById = useMemo(() => new Map(spaces.map((s) => [s.id, s.color])), [spaces]);
  const spaceColor = useCallback(
    (spaceId: string) => spaceColorById.get(spaceId),
    [spaceColorById],
  );

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", "all"],
    queryFn: listSessionsAll,
  });
  const { data: calendarEntries = [] } = useQuery({
    queryKey: ["calendar-entries", "all"],
    queryFn: listCalendarEntriesAll,
  });

  const days = visibleDays(view, anchor, weekStartsOn);
  const fromKey = dayKey(addDays(days[0], -1));
  const toKey = dayKey(addDays(days[days.length - 1], 1));
  const { data: externalEvents = [] } = useQuery({
    queryKey: [...EXTERNAL_EVENTS_KEY, fromKey, toKey],
    queryFn: () => listExternalEvents(fromKey, toKey),
    placeholderData: keepPreviousData,
  });
  const columns = buildColumns(days, sessions, externalEvents, calendarEntries);

  const step = useCallback(
    (direction: 1 | -1) => setAnchor((a) => stepAnchor(view, a, direction)),
    [view],
  );
  const pickDay = useCallback(
    (day: Date) => {
      setAnchor(day);
      setView("day");
    },
    [setView],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconCalendarWeek size={16} className="text-muted-foreground" />
          Calendar
        </h1>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
                Today
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Go to today <Kbd>T</Kbd>
            </TooltipContent>
          </Tooltip>
          {([-1, 1] as const).map((direction) => (
            <Tooltip key={direction}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={stepLabel(view, direction)}
                  onClick={() => step(direction)}
                >
                  {direction === -1 ? <IconChevronLeft /> : <IconChevronRight />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                {stepLabel(view, direction)} <Kbd>{direction === -1 ? "←" : "→"}</Kbd>
              </TooltipContent>
            </Tooltip>
          ))}
          <span className="pl-1 text-sm font-medium whitespace-nowrap">
            {rangeLabel(view, days, anchor)}
          </span>
          {view !== "month" && (
            <span className="pl-1.5 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
              Week {weekNumber(days)}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <nav aria-label="Calendar views" className="flex items-center gap-1">
            {CALENDAR_VIEWS.map((v) => (
              <Tooltip key={v.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={view === v.id}
                    onClick={() => setView(v.id)}
                    className={cn(
                      "h-7 shrink-0 cursor-pointer rounded-md border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                      view === v.id && "border-border bg-accent text-foreground",
                    )}
                  >
                    {v.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-2">
                  {v.label} view <Kbd>{v.key}</Kbd>
                </TooltipContent>
              </Tooltip>
            ))}
          </nav>
        </div>
      </header>

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          columns={columns}
          highlightIds={new Set()}
          onSelect={() => {}}
          onPickDay={pickDay}
          spaceColor={spaceColor}
        />
      ) : (
        <TimeGrid
          key={view}
          columns={columns}
          selection={null}
          highlightIds={new Set()}
          onSelect={() => {}}
          onPickDay={pickDay}
          spaceColor={spaceColor}
        />
      )}
    </div>
  );
}
