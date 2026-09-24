import { IconCalendarEvent, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { addDays, addMonths, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatDate,
  formatMonth,
  formatShortDate,
  formatWeekday,
  useDateTimeSettings,
} from "@/lib/datetime";
import { cn } from "@/lib/utils";

/// `YYYY-MM-DD` for a local date.
function toDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/// `YYYY-MM-DD` as a local midnight.
function fromDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/// Days an arrow key moves the focus by.
function keyStep(key: string): number | null {
  if (key === "ArrowLeft") return -1;
  if (key === "ArrowRight") return 1;
  if (key === "ArrowUp") return -7;
  if (key === "ArrowDown") return 7;
  return null;
}

/// A month grid for picking one day. Arrow keys move between days, Page Up and
/// Page Down between months, Enter picks. Weeks start on Sunday for the American
/// date format and on Monday otherwise.
export function Calendar({
  value,
  onSelect,
  className,
}: {
  value: string | null;
  onSelect: (day: string) => void;
  className?: string;
}) {
  const weekStartsOn = useDateTimeSettings((s) => (s.dateFormat === "american" ? 0 : 1));
  const [focused, setFocused] = useState(() => (value ? fromDay(value) : new Date()));
  const [month, setMonth] = useState(() => startOfMonth(focused));
  const gridRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, [focused]);

  const selected = value ? fromDay(value) : null;
  const today = new Date();
  const gridStart = startOfWeek(month, { weekStartsOn });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function moveTo(date: Date) {
    moved.current = true;
    setFocused(date);
    if (!isSameMonth(date, month)) setMonth(startOfMonth(date));
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = keyStep(e.key);
    let next: Date | null = null;
    if (step !== null) next = addDays(focused, step);
    else if (e.key === "PageUp") next = addMonths(focused, -1);
    else if (e.key === "PageDown") next = addMonths(focused, 1);
    else if (e.key === "Home") next = startOfWeek(focused, { weekStartsOn });
    else if (e.key === "End") next = addDays(startOfWeek(focused, { weekStartsOn }), 6);
    if (!next) return;
    e.preventDefault();
    // Keeps an enclosing command menu from reading the same arrow keys.
    e.stopPropagation();
    moveTo(next);
  }

  function shiftMonth(delta: number) {
    const nextMonth = addMonths(month, delta);
    setMonth(nextMonth);
    setFocused(nextMonth);
  }

  return (
    <div className={cn("flex w-64 flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="pl-1 text-sm font-medium">{formatMonth(month)}</span>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Previous Month"
                onClick={() => shiftMonth(-1)}
              >
                <IconChevronLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous Month</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Next Month"
                onClick={() => shiftMonth(1)}
              >
                <IconChevronRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next Month</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {days.slice(0, 7).map((day) => (
          <span key={day.getDay()} className="py-1">
            {formatWeekday(day, "short")}
          </span>
        ))}
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={formatMonth(month)}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-0.5"
      >
        {days.map((day) => {
          const isSelected = selected !== null && isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.getTime()}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={formatDate(day)}
              tabIndex={isSameDay(day, focused) ? 0 : -1}
              onClick={() => onSelect(toDay(day))}
              className={cn(
                "relative flex h-8 cursor-pointer items-center justify-center rounded-md text-xs tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                !isSameMonth(day, month) && "text-muted-foreground/50",
                isToday && !isSelected && "font-semibold text-primary",
                isSelected && "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
              )}
            >
              {day.getDate()}
              {isToday && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full bg-primary",
                    isSelected && "bg-primary-foreground",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/// A date field styled like the other inputs: a trigger showing the picked day in
/// the chosen date format, opening a `Calendar`. Values are `YYYY-MM-DD` strings.
export function DateInput({
  value,
  onChange,
  placeholder = "Pick a date…",
  clearable = true,
  className,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onChange: (day: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Re-render when the date format changes.
  useDateTimeSettings((s) => s.dateFormat);

  function choose(day: string | null) {
    setOpen(false);
    if (day !== value) onChange(day);
  }

  return (
    <div className={cn("relative flex w-full min-w-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-accent px-3 text-left text-sm shadow-xs transition-colors outline-none hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent/80",
              clearable && value && "pr-8",
            )}
          >
            <IconCalendarEvent size={14} className="shrink-0 text-muted-foreground" />
            {value ? (
              <span className="min-w-0 flex-1 truncate">
                {formatWeekday(value, "short")}, {formatShortDate(value)}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          align="start"
          className="w-auto p-3"
          onOpenAutoFocus={(e) => {
            // Start on the picked day (or today) so arrow keys work right away.
            e.preventDefault();
            contentRef.current
              ?.querySelector<HTMLElement>("[role=gridcell][tabindex='0']")
              ?.focus();
          }}
        >
          <Calendar value={value} onSelect={choose} />
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <Button variant="ghost" size="sm" onClick={() => choose(toDay(new Date()))}>
              Today
            </Button>
            {clearable && value && (
              <Button variant="ghost" size="sm" onClick={() => choose(null)}>
                Clear
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Clear Date"
              onClick={() => onChange(null)}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <IconX size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Clear Date</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
