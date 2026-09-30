import { IconCalendarWeek, IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, isToday } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { Button } from "@nookly/ui/components/button";
import { SUCCESS_REVERT_MS } from "#/components/action-feedback.tsx";
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
  type SlotRange,
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
import { MonthGrid } from "../sessions/calendar/MonthGrid";
import { TimeGrid } from "../sessions/calendar/TimeGrid";
import { QuickCreateCalendarEntryDialog } from "../calendar-entries/calendar/QuickCreateCalendarEntryDialog";
import { qk } from "#/lib/query-keys.ts";

/// The fifth cross-Space exception (`docs/04-navigation-spaces.md`): one
/// unified, space-neutral calendar layering the external overlay (bottom, read
/// only), every Space's Sessions, and every Space's Calendar entries (both
/// editable in place, via the same popovers their own per-Space calendars
/// use), each tinted by its origin Space's own accent color rather than any
/// single "active" Space's. Creating a Session still only happens on its own
/// Space's calendar (a Session needs a Course, and there's no single "current"
/// Space here to scope one to) — but a calendar entry can be created directly
/// from here too, the same drag/right-click surface as its own Space's
/// calendar, just with an added Space picker in the dialog.
export function UnifiedCalendarView() {
  const [view, setViewState] = useState<CalendarView>(() => readView(STORAGE_KEYS.calendarView));
  const [anchor, setAnchor] = useState(() => new Date());
  const [draft, setDraft] = useState<SlotRange | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const weekStartsOn = useDateTimeSettings((s) => (s.dateFormat === "american" ? 0 : 1));

  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    writeView(next, STORAGE_KEYS.calendarView);
  }, []);

  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceColorById = useMemo(() => new Map(spaces.map((s) => [s.id, s.color])), [spaces]);
  const spaceColor = useCallback(
    (spaceId: string) => spaceColorById.get(spaceId),
    [spaceColorById],
  );

  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.all,
    queryFn: listSessionsAll,
  });
  const { data: calendarEntries = [] } = useQuery({
    queryKey: qk.calendarEntries.all,
    queryFn: listCalendarEntriesAll,
  });

  const days = visibleDays(view, anchor, weekStartsOn);
  const fromKey = dayKey(addDays(days[0], -1));
  const toKey = dayKey(addDays(days[days.length - 1], 1));
  const { data: externalEvents = [] } = useQuery({
    queryKey: qk.externalCalendars.eventsBetween(fromKey, toKey),
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
  const startCreate = useCallback(() => {
    const shown = visibleDays(view, anchor, weekStartsOn);
    const today = shown.find((d) => isToday(d));
    const startMin = today ? Math.min((new Date().getHours() + 1) * 60, 23 * 60) : 9 * 60;
    setDraft({ date: today ?? shown[0], startMin, endMin: startMin + 60 });
  }, [view, anchor, weekStartsOn]);

  useEffect(() => {
    if (highlightIds.size === 0) return;
    const timer = setTimeout(() => setHighlightIds(new Set()), SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [highlightIds]);

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" className="ml-1 gap-1.5" onClick={startCreate}>
                <IconPlus />
                New entry
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a calendar entry</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          columns={columns}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          spaceColor={spaceColor}
        />
      ) : (
        <TimeGrid
          key={view}
          columns={columns}
          selection={draft}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          slotCreateNoun="Calendar Entry"
          spaceColor={spaceColor}
          allowMultiDay
        />
      )}

      <QuickCreateCalendarEntryDialog
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onCreated={(ids) => setHighlightIds(new Set(ids))}
      />
    </div>
  );
}
