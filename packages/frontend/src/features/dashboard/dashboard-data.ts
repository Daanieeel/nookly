import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listAssignmentsAllSpaces } from "#/lib/api/assignments.ts";
import { listExamsAllSpaces } from "#/lib/api/exams.ts";
import { countUnrefinedJotsAllSpaces, listUnrefinedJotsAllSpaces } from "#/lib/api/notes.ts";
import { listSessionsBetween } from "#/lib/api/sessions.ts";
import { listOpenTasksDueOrOverdue } from "#/lib/api/tasks.ts";
import type { BriefingSession, Entity, PageSummary, Task } from "#/lib/api/types.ts";
import { isDone } from "#/features/assignments/assignment-model.ts";
import { toDay } from "#/features/tasks/task-model.ts";
import { qk } from "#/lib/query-keys.ts";

/// Rows the Jots panel shows.
const JOT_LIMIT = 3;

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
  /// Today's Sessions, earliest first, whether or not they've started yet.
  todaySessions: BriefingSession[];
  /// Every deadline from today on, soonest first.
  deadlines: Deadline[];
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

/// The one source the briefing sentence and the Jots panel read, so the prose and
/// the list always describe the same facts.
export function useDashboardData(): DashboardData {
  const now = useNow();
  const today = toDay(now);

  const { data: tasks = [] } = useQuery({
    queryKey: qk.tasks.openDueOrOverdueList,
    queryFn: listOpenTasksDueOrOverdue,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.todayBetween(today, today),
    queryFn: () => listSessionsBetween(today, today),
  });
  const { data: exams = [] } = useQuery({ queryKey: qk.exams.all, queryFn: listExamsAllSpaces });
  const { data: assignments = [] } = useQuery({
    queryKey: qk.assignments.all,
    queryFn: listAssignmentsAllSpaces,
  });
  const { data: jots = [] } = useQuery({
    queryKey: qk.jots.unrefinedList(JOT_LIMIT),
    queryFn: () => listUnrefinedJotsAllSpaces(JOT_LIMIT),
  });
  const { data: jotCount = 0 } = useQuery({
    queryKey: qk.jots.unrefinedAll,
    queryFn: countUnrefinedJotsAllSpaces,
  });

  const todaySessions = sessions.filter((s) => s.date === today);

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

  return {
    now,
    today,
    tasks,
    todaySessions,
    deadlines,
    jots,
    jotCount,
  };
}
