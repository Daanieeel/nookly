import {
  IconArrowRight,
  IconCalendarStats,
  IconCalendarWeek,
  IconChalkboard,
  IconClipboardList,
  IconFeather,
  IconMoodSmile,
  IconSparkles,
  IconTargetArrow,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays } from "date-fns";
import type { ReactNode } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "@/components/action-feedback";
import { type ContextTargetProps, entityTarget } from "@/components/context-menu/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { refineJotIntoNote } from "@/features/notes/refine-jot";
import { previewLines } from "@/features/notes/note-preview";
import { TaskStatusIcon } from "@/features/tasks/task-properties";
import { parseDay, sortStatuses, statusKind, toDay } from "@/features/tasks/task-model";
import { listSpaces } from "@/lib/api/spaces";
import type { BriefingSession, PageSummary, Task, TaskStatus } from "@/lib/api/types";
import { formatClock, formatShortDate, formatWeekday } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";
import type { DashboardData, Deadline } from "./dashboard-data";
import { EntityPill, entityLink, listLink, LinkToken, useOpenTarget } from "./dashboard-links";

/// Rows each Today section shows before pointing at the full list.
const TODAY_LIMIT = 5;
/// Deadlines listed under the This Week strip.
const WEEK_DEADLINE_LIMIT = 3;

/// "Today", "Tomorrow", a weekday within the coming week, a short date beyond it.
function dayLabel(day: string, today: string): string {
  const diff = differenceInCalendarDays(parseDay(day), parseDay(today));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return formatWeekday(parseDay(day), "short");
  return formatShortDate(day);
}

function useSpaceNames(): Map<string, string> {
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  return new Map(spaces.map((s) => [s.id, s.name]));
}

/// A flat Dashboard section: no box and no rules, just a quiet heading with its
/// summary right beside it, and rows sitting directly on the page.
function Section({
  icon,
  title,
  action,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col", className)}>
      <header className="flex items-center gap-2 px-2 pb-2">
        <span className="flex text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-medium">{title}</h2>
        {action && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">{action}</div>
        )}
      </header>
      {children}
    </section>
  );
}

/// A whole clickable row with a primary label and trailing meta.
function Row({
  icon,
  children,
  meta,
  onClick,
  ...rest
}: {
  icon: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
} & Partial<ContextTargetProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span className="flex shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {meta && (
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {meta}
        </span>
      )}
    </button>
  );
}

/// An empty section reads as one quiet row in the list's own rhythm, not a
/// centered block that breaks the left edge.
function EmptyRow({ icon: Icon, children }: { icon: TablerIcon; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
      <Icon size={14} className="shrink-0" />
      {children}
    </p>
  );
}

function MoreLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {count} more
    </button>
  );
}

// Today / Next Up

function TaskRow({
  task,
  statuses,
  spaceName,
  today,
}: {
  task: Task;
  statuses: TaskStatus[];
  spaceName: string | undefined;
  today: string;
}) {
  const open = useOpenTarget();
  const status = statuses.find((s) => s.id === task.statusId);
  const due = task.dueDate?.slice(0, 10);
  const overdue = due != null && due < today;
  return (
    <Row
      icon={
        status ? (
          <TaskStatusIcon status={status} kind={statusKind(status, statuses)} />
        ) : (
          <IconTargetArrow size={14} />
        )
      }
      onClick={() => open(entityLink(task.entity.id, task.entity.spaceId))}
      {...entityTarget(task.entity)}
      meta={
        <>
          {spaceName && <span className="max-w-32 truncate">{spaceName}</span>}
          {status && <Badge>{status.name}</Badge>}
          {due && (
            <span className={cn(overdue && "text-destructive")}>
              {overdue ? `Overdue, ${formatShortDate(due)}` : dayLabel(due, today)}
            </span>
          )}
        </>
      }
    >
      <span className="truncate">{displayTitle(task.entity)}</span>
    </Row>
  );
}

function SessionRow({ session, today }: { session: BriefingSession; today: string }) {
  const open = useOpenTarget();
  return (
    <Row
      icon={<IconChalkboard size={14} />}
      onClick={() => open(entityLink(session.entityId, session.spaceId))}
      meta={`${dayLabel(session.date, today)}, ${formatClock(session.startTime)}`}
    >
      <EntityPill title={session.courseTitle || session.title || "Untitled Session"} />
    </Row>
  );
}

function DeadlineRow({ deadline, today }: { deadline: Deadline; today: string }) {
  const open = useOpenTarget();
  const Icon = deadline.kind === "exam" ? IconCalendarStats : IconClipboardList;
  return (
    <Row
      icon={<Icon size={14} />}
      onClick={() => open(entityLink(deadline.entity.id, deadline.entity.spaceId))}
      {...entityTarget(deadline.entity)}
      meta={
        <>
          <span>{deadline.kind === "exam" ? "Exam" : "Assignment"}</span>
          <span>{dayLabel(deadline.date, today)}</span>
        </>
      }
    >
      <EntityPill title={displayTitle(deadline.entity)} />
    </Row>
  );
}

function TodayWidget({ data, className }: { data: DashboardData; className?: string }) {
  const open = useOpenTarget();
  const spaceNames = useSpaceNames();
  const statuses = sortStatuses(data.statuses);
  const { tasks, nextSession, today } = data;
  const nextDeadline = data.deadlines[0];
  const empty = tasks.length === 0 && !nextSession && !nextDeadline;

  return (
    <Section icon={<IconTargetArrow size={14} />} title="Today" className={className}>
      {empty && <EmptyRow icon={IconMoodSmile}>Nothing urgent. Enjoy the calm.</EmptyRow>}
      {tasks.length > 0 && (
        <>
          {tasks.slice(0, TODAY_LIMIT).map((task) => (
            <TaskRow
              key={task.entity.id}
              task={task}
              statuses={statuses}
              spaceName={spaceNames.get(task.entity.spaceId)}
              today={today}
            />
          ))}
          {tasks.length > TODAY_LIMIT && (
            <MoreLink
              count={tasks.length - TODAY_LIMIT}
              onClick={() =>
                open(
                  listLink(
                    "tasks",
                    tasks.map((t) => t.entity.spaceId),
                  ),
                )
              }
            />
          )}
        </>
      )}
      {nextSession && (
        <>
          <SessionRow session={nextSession} today={today} />
        </>
      )}
      {nextDeadline && (
        <>
          <DeadlineRow deadline={nextDeadline} today={today} />
        </>
      )}
    </Section>
  );
}

// Unrefined Jots

function jotSnippet(jot: PageSummary): string {
  const lines = previewLines(jot.preview);
  if (jot.entity.title.trim()) {
    const title = displayTitle(jot.entity);
    const body = lines.filter((l) => l.toLowerCase() !== title.toLowerCase()).join(" ");
    return body ? `${title}: ${body}` : title;
  }
  return lines.join(" ") || "Empty Jot";
}

function RefineButton({ jot }: { jot: PageSummary }) {
  const queryClient = useQueryClient();
  const refine = useMutation({ mutationFn: () => refineJotIntoNote(jot.entity, queryClient) });
  const status = statusOf(refine);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={refine.isPending}
        onClick={() => refine.mutate()}
        className="h-7 shrink-0 gap-1 px-2"
      >
        <StatusIcon status={status} idle={<IconArrowRight size={14} />} />
        <span className={statusTextClass(status)}>{status === "error" ? "Retry" : "Refine"}</span>
      </Button>
      <StatusAnnouncer
        message={
          status === "pending"
            ? "Refining Jot"
            : status === "error"
              ? "Couldn't create Note, try again"
              : null
        }
      />
    </>
  );
}

function JotRow({ jot, spaceName }: { jot: PageSummary; spaceName: string | undefined }) {
  const open = useOpenTarget();
  const snippet = jotSnippet(jot);
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5">
      <button
        type="button"
        onClick={() => open(entityLink(jot.entity.id, jot.entity.spaceId))}
        {...entityTarget(jot.entity)}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 px-2 py-1.5 text-left"
      >
        <span
          className={cn(
            "line-clamp-2 text-sm",
            snippet === "Empty Jot" && "text-muted-foreground italic",
          )}
        >
          {snippet}
        </span>
        {spaceName && <span className="truncate text-xs text-muted-foreground">{spaceName}</span>}
      </button>
      <RefineButton jot={jot} />
    </div>
  );
}

function JotsWidget({ data, className }: { data: DashboardData; className?: string }) {
  const open = useOpenTarget();
  const spaceNames = useSpaceNames();
  const { jots, jotCount } = data;
  const jotsList = listLink(
    "jots",
    jots.map((j) => j.entity.spaceId),
  );

  return (
    <Section
      icon={<IconFeather size={14} />}
      title="Unrefined Jots"
      className={className}
      action={
        jotCount > 0 && (
          <LinkToken onClick={() => open(jotsList)} className="font-normal text-muted-foreground">
            {jotCount}
          </LinkToken>
        )
      }
    >
      {jots.length === 0 && (
        <EmptyRow icon={IconSparkles}>Nothing waiting. Every Jot is refined.</EmptyRow>
      )}
      {jots.map((jot) => (
        <JotRow key={jot.entity.id} jot={jot} spaceName={spaceNames.get(jot.entity.spaceId)} />
      ))}
      {jotCount > jots.length && (
        <MoreLink count={jotCount - jots.length} onClick={() => open(jotsList)} />
      )}
    </Section>
  );
}

// This Week

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/// Exams and Assignments have separate list pages; a mixed set opens Exams.
function deadlineModule(deadlines: Deadline[]): "exams" | "assignments" {
  return deadlines.every((d) => d.kind === "assignment") ? "assignments" : "exams";
}

function WeekWidget({ data, className }: { data: DashboardData; className?: string }) {
  const open = useOpenTarget();
  const { weekSessions, weekDeadlines, weekStart, today } = data;
  const days = Array.from({ length: 7 }, (_, i) => toDay(addDays(weekStart, i)));
  const quiet = weekSessions.length === 0 && weekDeadlines.length === 0;

  return (
    <Section
      icon={<IconCalendarWeek size={14} />}
      title="This Week"
      className={className}
      action={
        !quiet && (
          <>
            <LinkToken
              onClick={() =>
                open(
                  listLink(
                    "sessions",
                    weekSessions.map((s) => s.spaceId),
                  ),
                )
              }
              className="font-normal text-muted-foreground"
            >
              {plural(weekSessions.length, "session")}
            </LinkToken>
            <span aria-hidden>·</span>
            <span>{plural(weekDeadlines.length, "deadline")}</span>
          </>
        )
      }
    >
      {quiet && <EmptyRow icon={IconCalendarWeek}>Nothing scheduled this week.</EmptyRow>}
      <div className={cn("grid grid-cols-7 gap-1", quiet && "hidden")}>
        {days.map((day) => {
          const sessions = weekSessions.filter((s) => s.date === day);
          const deadlines = weekDeadlines.filter((d) => d.date === day);
          const isToday = day === today;
          const past = day < today;
          return (
            <button
              key={day}
              type="button"
              onClick={() =>
                open(
                  listLink(
                    "sessions",
                    sessions.map((s) => s.spaceId),
                  ),
                )
              }
              aria-label={`${formatWeekday(parseDay(day))}: ${plural(sessions.length, "session")}, ${plural(deadlines.length, "deadline")}`}
              className={cn(
                "flex min-w-0 cursor-pointer flex-col items-center gap-0.5 rounded-md px-1 py-2 text-xs",
                isToday ? "bg-accent" : "hover:bg-black/5 dark:hover:bg-white/5",
                past && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "text-xs uppercase",
                  isToday ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {formatWeekday(parseDay(day), "short")}
              </span>
              <span className={cn("text-sm tabular-nums", isToday && "font-semibold")}>
                {parseDay(day).getDate()}
              </span>
              <span className="flex h-3.5 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                {sessions.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <IconChalkboard size={11} />
                    {sessions.length}
                  </span>
                )}
                {deadlines.length > 0 && (
                  <span className="flex items-center gap-0.5 text-caution">
                    <IconCalendarStats size={11} />
                    {deadlines.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {weekDeadlines.length > 0 && (
        <div className="flex flex-col pt-2">
          {weekDeadlines.slice(0, WEEK_DEADLINE_LIMIT).map((deadline) => (
            <DeadlineRow key={deadline.entity.id} deadline={deadline} today={today} />
          ))}
          {weekDeadlines.length > WEEK_DEADLINE_LIMIT && (
            <MoreLink
              count={weekDeadlines.length - WEEK_DEADLINE_LIMIT}
              onClick={() =>
                open(
                  listLink(
                    deadlineModule(weekDeadlines),
                    weekDeadlines.map((d) => d.entity.spaceId),
                  ),
                )
              }
            />
          )}
        </div>
      )}
    </Section>
  );
}

/// The Dashboard's three flat sections, in this order: Today and Unrefined Jots
/// side by side on wide windows, This Week full width below. Hairline rules
/// separate them, never boxes.
export function DashboardWidgets({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3">
      <TodayWidget data={data} className="pb-6 lg:col-span-2 lg:pr-8" />
      <JotsWidget
        data={data}
        className="border-t border-border py-6 lg:col-span-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
      />
      <WeekWidget data={data} className="border-t border-border pt-6 lg:col-span-3" />
    </div>
  );
}
