import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { getWeekYear, MascotFigure } from "#/components/mascot-figure.tsx";
import { Card } from "@nookly/ui/components/card";
import { isDone } from "#/features/assignments/assignment-model.ts";
import { listAssignmentsAllSpaces } from "#/lib/api/assignments.ts";
import { listExamsAllSpaces } from "#/lib/api/exams.ts";
import { countUnrefinedJotsAllSpaces } from "#/lib/api/notes.ts";
import { listSessionsToday } from "#/lib/api/sessions.ts";
import { countOpenTasksDueOrOverdue, countTasksDueToday } from "#/lib/api/tasks.ts";
import { listLink, useOpenTarget } from "#/features/dashboard/dashboard-links.tsx";
import { formatDate, formatWeekday } from "#/lib/datetime.ts";
import type { ModuleKey } from "#/lib/store/nav.ts";

const CYCLE_MS = 5_000;
const EXIT_MS = 380;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/// One cycling line, and the list page it opens when clicked.
interface Stat {
  text: string;
  module: ModuleKey;
}

export function SidebarMascot() {
  const open = useOpenTarget();
  const { data: tasksToday } = useQuery({
    queryKey: ["tasks-due-today"],
    queryFn: countTasksDueToday,
  });
  const { data: openTaskCount } = useQuery({
    queryKey: ["open-tasks-due-or-overdue"],
    queryFn: countOpenTasksDueOrOverdue,
  });
  const { data: sessions } = useQuery({ queryKey: ["sessions-today"], queryFn: listSessionsToday });
  const { data: jotCount } = useQuery({
    queryKey: ["unrefined-jots", "all"],
    queryFn: countUnrefinedJotsAllSpaces,
  });
  const { data: exams } = useQuery({ queryKey: ["exams-all"], queryFn: listExamsAllSpaces });
  const { data: assignments } = useQuery({
    queryKey: ["assignments-all"],
    queryFn: listAssignmentsAllSpaces,
  });

  const { week } = getWeekYear();
  const dateLine = `${formatWeekday(new Date(), "short")} · ${formatDate(new Date().toISOString())} · Week ${week}`;

  const stats: Stat[] = [];
  if (tasksToday)
    stats.push({
      text: `${tasksToday.done}/${tasksToday.total} tasks done today`,
      module: "tasks",
    });
  if (sessions)
    stats.push({
      text:
        sessions.length === 0 ? "no sessions today" : `${plural(sessions.length, "session")} today`,
      module: "sessions",
    });
  if (openTaskCount !== undefined)
    stats.push({ text: `${plural(openTaskCount, "task")} due or overdue`, module: "tasks" });
  if (exams && assignments) {
    const today = startOfDay(new Date());
    const upcoming =
      exams.filter(
        (e) =>
          e.entity.deletedAt == null &&
          e.status !== "done" &&
          e.examDate != null &&
          differenceInCalendarDays(new Date(e.examDate), today) >= 0,
      ).length +
      assignments.filter(
        (a) =>
          a.entity.deletedAt == null &&
          !isDone(a) &&
          a.dueDate != null &&
          differenceInCalendarDays(new Date(a.dueDate), today) >= 0,
      ).length;
    stats.push({ text: `${plural(upcoming, "deadline")} coming up`, module: "exams" });
  }
  if (jotCount !== undefined)
    stats.push({ text: `${plural(jotCount, "jot")} waiting to be refined`, module: "jots" });

  const [index, setIndex] = useState(0);
  // The stat that just cycled out, rendered briefly on top of the new one so
  // it can slide/fade away instead of being swapped instantly.
  const [outgoing, setOutgoing] = useState<{ text: string; key: number } | null>(null);
  const exitTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (stats.length < 2) return;
    // Re-armed each tick (rather than setInterval) so the closure always
    // reads the current `index`/`stats` instead of a stale snapshot.
    const id = setTimeout(() => {
      setOutgoing({ text: stats[index].text, key: index });
      clearTimeout(exitTimeout.current);
      exitTimeout.current = setTimeout(() => setOutgoing(null), EXIT_MS);
      setIndex((i) => (i + 1) % stats.length);
    }, CYCLE_MS);
    return () => {
      clearTimeout(id);
      clearTimeout(exitTimeout.current);
    };
  }, [stats.length, index]);

  const stat = stats.length > 0 ? stats[index % stats.length] : undefined;

  return (
    <Card className="flex-row items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
      {/* Fixed-size wrapper keeps the card's height locked to the text column
          even though the blob itself renders a bit larger and overflows it. */}
      <span className="relative size-7 shrink-0">
        <MascotFigure size={36} className="absolute -top-1 -left-1" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-xs group-data-[collapsible=icon]:hidden">
        <span className="truncate text-accent-foreground/70">{dateLine}</span>
        <span className="relative h-4 overflow-hidden text-accent-foreground">
          {outgoing && (
            <span key={outgoing.key} className="sidebar-mascot-stat-out block truncate">
              {outgoing.text}
            </span>
          )}
          {stat ? (
            <button
              key={index}
              type="button"
              onClick={() => open(listLink(stat.module))}
              className="sidebar-mascot-stat-in block w-full cursor-pointer truncate text-left underline-offset-2 hover:underline"
            >
              {stat.text}
            </button>
          ) : (
            <span className="block truncate">…</span>
          )}
        </span>
      </div>
    </Card>
  );
}
