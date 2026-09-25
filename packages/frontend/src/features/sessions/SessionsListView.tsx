import {
  IconChalkboard,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, isToday } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { SUCCESS_REVERT_MS } from "#/components/action-feedback.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { getEntity } from "#/lib/api/entities.ts";
import { listExternalEvents } from "#/lib/api/externalCalendars.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
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
} from "./calendar/calendar-model";
import { MonthGrid } from "./calendar/MonthGrid";
import { QuickCreateSessionDialog } from "./calendar/QuickCreateSessionDialog";
import { TimeGrid } from "./calendar/TimeGrid";
import { EXTERNAL_EVENTS_KEY } from "./external-calendars/external-calendar-sync";

/// True while typing somewhere, so single key shortcuts stay out of the way.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/// The Sessions page is a full calendar, modeled on Outlook: Day, Work week,
/// Week and Month views over the whole page. The calendar is the creation
/// surface: drag across time (or click a day in Month) to start a Session.
/// External calendars show as a read only overlay. See `ExamsListView` for the
/// `filterCourseId` convention.
export function SessionsListView({
  spaceId,
  filterCourseId,
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const [view, setViewState] = useState<CalendarView>(readView);
  const [anchor, setAnchor] = useState(() => new Date());
  const [draft, setDraft] = useState<SlotRange | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const weekStartsOn = useDateTimeSettings((s) => (s.dateFormat === "american" ? 0 : 1));
  const setNavView = useNavStore((s) => s.setView);

  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    writeView(next);
  }, []);

  const { data: allSessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
  });
  const { data: filterCourse } = useQuery({
    queryKey: ["entity", filterCourseId],
    // SAFETY: the query only runs when `enabled`, i.e. once `filterCourseId` is set.
    queryFn: () => getEntity(filterCourseId as string),
    enabled: Boolean(filterCourseId),
  });
  const { data: courseRelationships = [] } = useQuery({
    queryKey: ["relationships", filterCourseId],
    // SAFETY: the query only runs when `enabled`, i.e. once `filterCourseId` is set.
    queryFn: () => listRelationships(filterCourseId as string, "to"),
    enabled: Boolean(filterCourseId),
  });
  const sessions = filterCourseId
    ? allSessions.filter((s) =>
        courseRelationships.some(
          (r) => r.relationshipType === "session-course" && r.fromEntityId === s.entity.id,
        ),
      )
    : allSessions;

  const days = visibleDays(view, anchor, weekStartsOn);
  // External calendars are a read only overlay, never Sessions. Hidden while the
  // view is narrowed to one Course, since they belong to none. Padded by a day
  // because the cache compares timed events by their UTC date.
  const fromKey = dayKey(addDays(days[0], -1));
  const toKey = dayKey(addDays(days[days.length - 1], 1));
  const { data: externalEvents = [] } = useQuery({
    queryKey: [...EXTERNAL_EVENTS_KEY, fromKey, toKey],
    queryFn: () => listExternalEvents(fromKey, toKey),
    enabled: !filterCourseId,
    placeholderData: keepPreviousData,
  });
  const columns = buildColumns(days, sessions, filterCourseId ? [] : externalEvents);

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
  /// C and the New session button: the next full hour today when today is on
  /// screen, otherwise 9:00 on the first day shown.
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
        createLabel: "New Session",
        create: startCreate,
      })}
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconChalkboard size={16} className="text-muted-foreground" />
          Sessions
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
        {filterCourseId && filterCourse && (
          <Badge variant="secondary" className="gap-1 pr-1">
            Filtered by {displayTitle(filterCourse)}
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setNavView({ kind: "module", spaceId, module: "sessions" })}
              className="rounded-full p-0.5 hover:bg-accent-foreground/10"
            >
              <IconX size={11} />
            </button>
          </Badge>
        )}
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
                New session
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Create a session <Kbd>C</Kbd>
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
          spaceId={spaceId}
          onPickDay={pickDay}
        />
      ) : (
        <TimeGrid
          key={view}
          spaceId={spaceId}
          columns={columns}
          selection={draft}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
        />
      )}

      <QuickCreateSessionDialog
        spaceId={spaceId}
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onCreated={(ids) => setHighlightIds(new Set(ids))}
      />
    </div>
  );
}
