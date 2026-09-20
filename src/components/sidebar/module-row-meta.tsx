import { useQueries, useQuery } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { useMemo } from "react";
import { listAssignments } from "@/lib/api/assignments";
import { listDecks, listDueCards } from "@/lib/api/decks";
import { listExams } from "@/lib/api/exams";
import { countJotsWithoutRefinement } from "@/lib/api/notes";
import { listTasks, listTaskStatuses } from "@/lib/api/tasks";
import type { ModuleKey } from "@/lib/store/nav";
import { SidebarCountBadge, SidebarUrgencyChip } from "./sidebar-badges";

function TasksMeta({ spaceId, spaceColor }: { spaceId: string; spaceColor: string }) {
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", spaceId],
    queryFn: () => listTasks(spaceId),
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
    staleTime: Infinity,
  });
  const doneness = useMemo(() => new Map(statuses.map((s) => [s.id, s.doneness])), [statuses]);
  const open = tasks.filter((t) => !t.entity.deletedAt && (doneness.get(t.statusId) ?? 0) < 100);
  const today = startOfDay(new Date());
  const urgent = open.some((t) => t.dueDate && startOfDay(new Date(t.dueDate)) <= today);
  return <SidebarCountBadge count={open.length} accent={urgent} accentColor={spaceColor} />;
}

function JotsMeta({ spaceId }: { spaceId: string }) {
  const { data: count = 0 } = useQuery({
    queryKey: ["jots-without-refinement", spaceId],
    queryFn: () => countJotsWithoutRefinement(spaceId),
  });
  return <SidebarCountBadge count={count} />;
}

function ExamsMeta({ spaceId, spaceColor }: { spaceId: string; spaceColor: string }) {
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const { data: decks = [] } = useQuery({
    queryKey: ["decks", spaceId],
    queryFn: () => listDecks(spaceId),
  });
  const dueQueries = useQueries({
    queries: decks.map((deck) => ({
      queryKey: ["due-cards", deck.id],
      queryFn: () => listDueCards(deck.id),
    })),
  });
  const dueCards = dueQueries.flatMap((q) => q.data ?? []);
  const today = startOfDay(new Date());
  const overdue = dueCards.some((c) => new Date(c.dueAt) < today);

  const nearestExam = exams
    .filter((e) => e.grade == null && e.examDate && startOfDay(new Date(e.examDate)) >= today)
    .sort((a, b) => new Date(a.examDate ?? 0).getTime() - new Date(b.examDate ?? 0).getTime())[0];

  return (
    <>
      {nearestExam?.examDate && <SidebarUrgencyChip date={nearestExam.examDate} />}
      <SidebarCountBadge count={dueCards.length} accent={overdue} accentColor={spaceColor} />
    </>
  );
}

function AssignmentsMeta({ spaceId }: { spaceId: string }) {
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  const today = startOfDay(new Date());
  const nearest = assignments
    .filter((a) => a.grade == null && a.dueDate && startOfDay(new Date(a.dueDate)) >= today)
    .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())[0];
  if (!nearest?.dueDate) return null;
  return <SidebarUrgencyChip date={nearest.dueDate} />;
}

export function ModuleRowMeta({
  moduleKey,
  spaceId,
  spaceColor,
}: {
  moduleKey: ModuleKey;
  spaceId: string;
  spaceColor: string;
}) {
  const content = (() => {
    switch (moduleKey) {
      case "tasks":
        return <TasksMeta spaceId={spaceId} spaceColor={spaceColor} />;
      case "jots":
        return <JotsMeta spaceId={spaceId} />;
      case "exams":
        return <ExamsMeta spaceId={spaceId} spaceColor={spaceColor} />;
      case "assignments":
        return <AssignmentsMeta spaceId={spaceId} />;
      default:
        return null;
    }
  })();
  if (!content) return null;
  return <span className="ml-auto flex items-center gap-1.5">{content}</span>;
}
