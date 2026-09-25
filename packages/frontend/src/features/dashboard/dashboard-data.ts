import { useQuery } from "@tanstack/react-query";
import { addDays, endOfWeek, startOfWeek } from "date-fns";
import { useEffect, useState } from "react";
import { listAssignmentsAllSpaces } from "#/lib/api/assignments.ts";
import { listExamsAllSpaces } from "#/lib/api/exams.ts";
import { countUnrefinedJotsAllSpaces, listUnrefinedJotsAllSpaces } from "#/lib/api/notes.ts";
import { listSessionsBetween } from "#/lib/api/sessions.ts";
import { listOpenTasksDueOrOverdue, listTaskStatuses } from "#/lib/api/tasks.ts";
import type { BriefingSession, Entity, PageSummary, Task, TaskStatus } from "#/lib/api/types.ts";
import { isDone } from "#/features/assignments/assignment-model.ts";
import { parseDay, toDay } from "#/features/tasks/task-model.ts";

/// How far ahead "next up" looks for a Session. Longer than a week.
const LOOKAHEAD_DAYS = 30;
/// Rows the Unrefined Jots widget shows.
export const JOT_LIMIT = 5;

/// An Exam or Assignment with a date whose status isn't finished: the two kinds
/// of deadline. A grade alone doesn't close one, its status does.
export interface Deadline {
  entity: Entity;
  kind: "exam" | "assignment";
  /// `YYYY-MM-DD`.
  date: string;
}

export interface DashboardData {
  now: Date;
  today: string;
  tasks: Task[];
  statuses: TaskStatus[];
  /// Today's Sessions, earliest first, whether or not they've started yet.
  todaySessions: BriefingSession[];
  /// The first Session that hasn't started yet.
  nextSession: BriefingSession | undefined;
  weekSessions: BriefingSession[];
  /// Every deadline from today on, soonest first.
  deadlines: Deadline[];
  weekDeadlines: Deadline[];
  weekStart: Date;
  weekEnd: Date;
  jots: PageSummary[];
  jotCount: number;
}

/// Ticks on each minute so greetings, "today" and "next up" follow the clock
/// without a reload.
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/// The one source both the briefing sentence and the widgets read, so the prose
/// and the lists always describe the same facts.
export function useDashboardData(): DashboardData {
  const now = useNow();
  const today = toDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const from = toDay(weekStart);
  // Always past `weekEnd`, so one range covers both this week and "next up".
  const to = toDay(addDays(now, LOOKAHEAD_DAYS));

  const { data: tasks = [] } = useQuery({
    queryKey: ["open-tasks-due-or-overdue", "list"],
    queryFn: listOpenTasksDueOrOverdue,
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-today", "between", from, to],
    queryFn: () => listSessionsBetween(from, to),
  });
  const { data: exams = [] } = useQuery({ queryKey: ["exams-all"], queryFn: listExamsAllSpaces });
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments-all"],
    queryFn: listAssignmentsAllSpaces,
  });
  const { data: jots = [] } = useQuery({
    queryKey: ["unrefined-jots", "all", "list", JOT_LIMIT],
    queryFn: () => listUnrefinedJotsAllSpaces(JOT_LIMIT),
  });
  const { data: jotCount = 0 } = useQuery({
    queryKey: ["unrefined-jots", "all"],
    queryFn: countUnrefinedJotsAllSpaces,
  });

  const clock = now.toTimeString().slice(0, 5);
  const todaySessions = sessions.filter((s) => s.date === today);
  const nextSession = sessions.find(
    (s) => s.date > today || (s.date === today && s.startTime >= clock),
  );
  const weekSessions = sessions.filter((s) => parseDay(s.date) <= weekEnd);

  const deadlines: Deadline[] = [
    ...exams.flatMap((e) =>
      e.entity.deletedAt == null && e.status !== "done" && e.examDate != null
        ? [{ entity: e.entity, kind: "exam" as const, date: e.examDate.slice(0, 10) }]
        : [],
    ),
    ...assignments.flatMap((a) =>
      a.entity.deletedAt == null && !isDone(a) && a.dueDate != null
        ? [{ entity: a.entity, kind: "assignment" as const, date: a.dueDate.slice(0, 10) }]
        : [],
    ),
  ]
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weekDeadlines = deadlines.filter((d) => parseDay(d.date) <= weekEnd);

  return {
    now,
    today,
    tasks,
    statuses,
    todaySessions,
    nextSession,
    weekSessions,
    deadlines,
    weekDeadlines,
    weekStart,
    weekEnd,
    jots,
    jotCount,
  };
}
