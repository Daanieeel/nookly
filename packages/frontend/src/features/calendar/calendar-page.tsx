import type { Icon } from "@tabler/icons-react";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { isToday } from "date-fns";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@nookly/ui/components/button";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { SUCCESS_REVERT_MS } from "#/components/action-feedback.tsx";
import { useScreenHotkeys } from "#/hooks/use-app-hotkey.ts";
import { useWeekStartsOn } from "#/lib/week-start.ts";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  type SlotKind,
  type SlotRange,
  defaultSlotFrom,
  rangeLabel,
  readView,
  stepAnchor,
  stepLabel,
  visibleDays,
  weekNumber,
  writeView,
} from "../sessions/calendar/calendar-model";

/// Shared state, hotkeys and header for the three full-page calendars
/// (Sessions, Calendar module and the unified Calendar page).
/// `kind` is what this page creates, which sets the length of a new item's proposed
/// range. The unified Calendar page only creates calendar entries.
export function useCalendarPage(storageKey: string | undefined, kind: SlotKind) {
  const [view, setViewState] = useState<CalendarView>(() => readView(storageKey));
  const [anchor, setAnchor] = useState(() => new Date());
  const [draft, setDraft] = useState<SlotRange | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const weekStartsOn = useWeekStartsOn();

  const setView = useCallback(
    (next: CalendarView) => {
      setViewState(next);
      writeView(next, storageKey);
    },
    [storageKey],
  );

  const days = visibleDays(view, anchor, weekStartsOn);

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
  /// The next full hour today when today is on screen, otherwise 9:00 on the
  /// first day shown.
  const startCreate = useCallback(() => {
    const shown = visibleDays(view, anchor, weekStartsOn);
    const today = shown.find((d) => isToday(d));
    const startMin = today ? Math.min((new Date().getHours() + 1) * 60, 23 * 60) : 9 * 60;
    setDraft({ date: today ?? shown[0], ...defaultSlotFrom(startMin, kind) });
  }, [view, anchor, weekStartsOn, kind]);

  const goToday = useCallback(() => setAnchor(new Date()), []);

  useScreenHotkeys([
    ...CALENDAR_VIEWS.map((v) => ({ shortcut: v.shortcut, callback: () => setView(v.id) })),
    { shortcut: "today", callback: goToday },
    { shortcut: "previousPeriod", callback: () => step(-1) },
    { shortcut: "nextPeriod", callback: () => step(1) },
    { shortcut: "create", callback: () => startCreate() },
    { shortcut: "newItem", callback: () => startCreate() },
  ]);

  useEffect(() => {
    if (highlightIds.size === 0) return;
    const timer = setTimeout(() => setHighlightIds(new Set()), SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [highlightIds]);

  return {
    view,
    anchor,
    days,
    draft,
    setDraft,
    highlightIds,
    setHighlightIds,
    setView,
    step,
    pickDay,
    startCreate,
    goToday,
  };
}

export type CalendarPageState = ReturnType<typeof useCalendarPage>;

export function CalendarPageHeader({
  page,
  icon: HeaderIcon,
  title,
  createLabel,
  createTooltip,
  createKbd = true,
  afterNav,
}: {
  page: CalendarPageState;
  icon: Icon;
  title: string;
  createLabel: string;
  createTooltip: string;
  /// Shows the C shortcut hint in the create tooltip.
  createKbd?: boolean;
  /// Rendered between the date navigation and the view switcher.
  afterNav?: ReactNode;
}) {
  const { view, days, anchor, step, setView, startCreate, goToday } = page;
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 pr-2 pl-4">
      <h1 className="flex items-center gap-2 text-sm font-medium">
        <HeaderIcon size={16} className="text-muted-foreground" />
        {title}
      </h1>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm" onClick={goToday}>
              Today
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            Go to today <ShortcutKbd name="today" />
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
              {stepLabel(view, direction)}{" "}
              <ShortcutKbd name={direction === -1 ? "previousPeriod" : "nextPeriod"} />
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
      {afterNav}
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
                {v.label} view <ShortcutKbd name={v.shortcut} />
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm" className="ml-1 gap-1.5" onClick={startCreate}>
              <IconPlus />
              {createLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent className={createKbd ? "flex items-center gap-2" : undefined}>
            {createTooltip} {createKbd && <ShortcutKbd name="create" />}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
