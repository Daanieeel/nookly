import { useQuery } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { isDone } from "#/features/assignments/assignment-model.ts";
import { listAssignments } from "#/lib/api/assignments.ts";
import { listDeckSummaries } from "#/lib/api/decks.ts";
import { listExams } from "#/lib/api/exams.ts";
import type { ModuleKey } from "#/lib/store/nav.ts";
import { SidebarUrgencyChip } from "./sidebar-badges";

function ExamsMeta({ spaceId }: { spaceId: string }) {
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const today = startOfDay(new Date());

  const nearestExam = exams
    .filter((e) => e.status !== "done" && e.examDate && startOfDay(new Date(e.examDate)) >= today)
    .sort((a, b) => new Date(a.examDate ?? 0).getTime() - new Date(b.examDate ?? 0).getTime())[0];

  if (!nearestExam?.examDate) return null;
  return <SidebarUrgencyChip date={nearestExam.examDate} />;
}

function AssignmentsMeta({ spaceId }: { spaceId: string }) {
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  const today = startOfDay(new Date());
  const nearest = assignments
    .filter((a) => !isDone(a) && a.dueDate && startOfDay(new Date(a.dueDate)) >= today)
    .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())[0];
  if (!nearest?.dueDate) return null;
  return <SidebarUrgencyChip date={nearest.dueDate} />;
}

/// How many cards are ready to study across the Space's decks.
function DecksMeta({ spaceId }: { spaceId: string }) {
  const { data: decks = [] } = useQuery({
    queryKey: ["deck-summaries", spaceId],
    queryFn: () => listDeckSummaries(spaceId),
  });
  const toStudy = decks.reduce((sum, d) => sum + d.stats.new + d.stats.learning + d.stats.due, 0);
  if (toStudy === 0) return null;
  return (
    <span
      className="shrink-0 text-xs text-sidebar-foreground/60 tabular-nums"
      title="Cards to study"
    >
      {toStudy}
    </span>
  );
}

export function ModuleRowMeta({ moduleKey, spaceId }: { moduleKey: ModuleKey; spaceId: string }) {
  const content = (() => {
    switch (moduleKey) {
      case "exams":
        return <ExamsMeta spaceId={spaceId} />;
      case "decks":
        return <DecksMeta spaceId={spaceId} />;
      case "assignments":
        return <AssignmentsMeta spaceId={spaceId} />;
      default:
        return null;
    }
  })();
  if (!content) return null;
  return <span className="ml-auto flex items-center gap-1.5">{content}</span>;
}
