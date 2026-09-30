import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { isToday } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { SUCCESS_REVERT_MS } from "#/components/action-feedback.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { listCalendarEntries } from "#/lib/api/calendarEntries.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  type SlotRange,
  buildColumns,
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
import { QuickCreateCalendarEntryDialog } from "./calendar/QuickCreateCalendarEntryDialog";
import { qk } from "#/lib/query-keys.ts";

/// True while typing somewhere, so single key shortcuts stay out of the way.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/// The per-Space Calendar module page: same Outlook-style calendar as
/// Sessions (Day/Work week/Week/Month, drag-to-create), but entirely separate
/// data — only this Space's calendar entries show here, never Sessions, and
/// there is no external-calendar overlay (that stays a Sessions-view/
/// unified-Calendar-page thing). See `docs/03-modules/sessions-timetable.md`
/// for the shared pattern.
export function CalendarEntriesListView({ spaceId }: { spaceId: string }) {
  const [view, setViewState] = useState<CalendarView>(() =>
    readView(STORAGE_KEYS.calendarModuleView),
  );
  const [anchor, setAnchor] = useState(() => new Date());
  const [draft, setDraft] = useState<SlotRange | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const weekStartsOn = useDateTimeSettings((s) => (s.dateFormat === "american" ? 0 : 1));

  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    writeView(next, STORAGE_KEYS.calendarModuleView);
  }, []);

  const { data: entries = [] } = useQuery({
    queryKey: qk.calendarEntries.bySpace(spaceId),
    queryFn: () => listCalendarEntries(spaceId),
  });
  // This Space's Sessions, shown here too but as secondary context next to
  // Calendar entries (see `SessionsListView`'s reciprocal fetch of entries).
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
  });
  // This Space's own accent color, so entries tint to it instead of the
  // fixed `--accent-purple` default (see `CalendarEntryBlock`'s `accentColor`).
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceAccent = spaces.find((s) => s.id === spaceId)?.color;
  const spaceColor = useCallback(() => spaceAccent, [spaceAccent]);

  const days = visibleDays(view, anchor, weekStartsOn);
  const columns = buildColumns(days, sessions, [], entries);

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
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditable(e.target) || document.querySelector("[role=dialog],[role=menu]")) return;
      const viewForKey = CALENDAR_VIEWS.find((v) => v.key === e.key);
      if (viewForKey) setView(viewForKey.id);
      else if (e.key === "t") setAnchor(new Date());
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "c") startCreate();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setView, step, startCreate]);

  useEffect(() => {
    if (highlightIds.size === 0) return;
    const timer = setTimeout(() => setHighlightIds(new Set()), SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [highlightIds]);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Calendar Entry",
        create: startCreate,
      })}
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconCalendarEvent size={16} className="text-muted-foreground" />
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
            <TooltipContent className="flex items-center gap-2">
              Create a calendar entry <Kbd>C</Kbd>
            </TooltipContent>
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
          secondaryKind="session"
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
          secondaryKind="session"
          allowMultiDay
        />
      )}

      <QuickCreateCalendarEntryDialog
        spaceId={spaceId}
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onCreated={(ids) => setHighlightIds(new Set(ids))}
      />
    </div>
  );
}
