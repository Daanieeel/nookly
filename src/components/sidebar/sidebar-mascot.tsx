import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { getWeekYear, MascotFigure } from "@/components/mascot-figure";
import { Card } from "@/components/ui/card";
import { listAssignmentsAllSpaces } from "@/lib/api/assignments";
import { listExamsAllSpaces } from "@/lib/api/exams";
import { countJotsWithoutRefinementAllSpaces } from "@/lib/api/notes";
import { listSessionsToday } from "@/lib/api/sessions";
import { countOpenTasksDueOrOverdue, countTasksDueToday } from "@/lib/api/tasks";

const CYCLE_MS = 5_000;
const EXIT_MS = 380;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function SidebarMascot() {
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
    queryKey: ["jots-without-refinement-all"],
    queryFn: countJotsWithoutRefinementAllSpaces,
  });
  const { data: exams } = useQuery({ queryKey: ["exams-all"], queryFn: listExamsAllSpaces });
  const { data: assignments } = useQuery({
    queryKey: ["assignments-all"],
    queryFn: listAssignmentsAllSpaces,
  });

  const { week } = getWeekYear();
  const dateLine = `${format(new Date(), "EEE · dd.MM.yyyy")} · Week ${week}`;

  const stats: string[] = [];
  if (tasksToday) stats.push(`${tasksToday.done}/${tasksToday.total} tasks done today`);
  if (sessions)
    stats.push(
      sessions.length === 0 ? "no sessions today" : `${plural(sessions.length, "session")} today`,
    );
  if (openTaskCount !== undefined) stats.push(`${plural(openTaskCount, "task")} due or overdue`);
  if (exams && assignments) {
    const today = startOfDay(new Date());
    const upcoming =
      exams.filter(
        (e) =>
          e.entity.deletedAt == null &&
          e.grade == null &&
          e.examDate != null &&
          differenceInCalendarDays(new Date(e.examDate), today) >= 0,
      ).length +
      assignments.filter(
        (a) =>
          a.entity.deletedAt == null &&
          a.grade == null &&
          a.dueDate != null &&
          differenceInCalendarDays(new Date(a.dueDate), today) >= 0,
      ).length;
    stats.push(`${plural(upcoming, "deadline")} coming up`);
  }
  if (jotCount !== undefined) stats.push(`${plural(jotCount, "jot")} waiting to be refined`);

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
      setOutgoing({ text: stats[index], key: index });
      clearTimeout(exitTimeout.current);
      exitTimeout.current = setTimeout(() => setOutgoing(null), EXIT_MS);
      setIndex((i) => (i + 1) % stats.length);
    }, CYCLE_MS);
    return () => {
      clearTimeout(id);
      clearTimeout(exitTimeout.current);
    };
  }, [stats.length, index]);

  const statLine = stats.length > 0 ? stats[index % stats.length] : "…";

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
          <span key={index} className="sidebar-mascot-stat-in block truncate">
            {statLine}
          </span>
        </span>
      </div>
    </Card>
  );
}
