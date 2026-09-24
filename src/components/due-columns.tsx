import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ReactNode } from "react";
import { formatShortDate, formatWeekday } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/// How far away a due date is, like "in 3 days" or "2d overdue", with a tone for
/// urgency: red once overdue, yellow on the day. Finished work gets no tone.
export function relativeDue(dueDate: string, done: boolean) {
  const days = differenceInCalendarDays(parseISO(dueDate), new Date());
  if (days < 0) {
    return done
      ? { text: `${-days}d ago`, tone: null }
      : { text: `${-days}d overdue`, tone: "text-destructive" };
  }
  if (days === 0) return { text: "Today", tone: done ? null : "text-caution" };
  if (days === 1) return { text: "Tomorrow", tone: null };
  return { text: `in ${days} days`, tone: null };
}

/// The day in the chosen date format, like "Mon, Sep 28", or "No date".
export function DueDateLabel({ dueDate }: { dueDate: string | null }) {
  return dueDate ? (
    <time
      dateTime={dueDate}
    >{`${formatWeekday(dueDate, "short")}, ${formatShortDate(dueDate)}`}</time>
  ) : (
    <span className="text-muted-foreground/60">No date</span>
  );
}

/// A list row's due date as two fixed width columns: the day, then how far away
/// it is. `date` replaces the plain day, e.g. with a button opening a picker.
export function DueColumns({
  dueDate,
  done,
  date,
}: {
  dueDate: string | null;
  done: boolean;
  date?: ReactNode;
}) {
  const due = dueDate ? relativeDue(dueDate, done) : null;
  return (
    <>
      <span className="pointer-events-none relative flex w-24 shrink-0 text-xs tabular-nums">
        {date ?? <DueDateLabel dueDate={dueDate} />}
      </span>
      <span
        className={cn(
          "pointer-events-none relative w-20 shrink-0 text-xs text-muted-foreground",
          due?.tone,
        )}
      >
        {due?.text}
      </span>
    </>
  );
}

/// Column labels matching `DueColumns`.
export function DueColumnLabels() {
  return (
    <>
      <span className="w-24 shrink-0">Due date</span>
      <span className="w-20 shrink-0">Time left</span>
    </>
  );
}
