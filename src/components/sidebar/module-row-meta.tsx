import { useQuery } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { listAssignments } from "@/lib/api/assignments";
import { listExams } from "@/lib/api/exams";
import type { ModuleKey } from "@/lib/store/nav";
import { SidebarUrgencyChip } from "./sidebar-badges";

function ExamsMeta({ spaceId }: { spaceId: string }) {
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const today = startOfDay(new Date());

  const nearestExam = exams
    .filter((e) => e.grade == null && e.examDate && startOfDay(new Date(e.examDate)) >= today)
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
    .filter((a) => a.grade == null && a.dueDate && startOfDay(new Date(a.dueDate)) >= today)
    .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())[0];
  if (!nearest?.dueDate) return null;
  return <SidebarUrgencyChip date={nearest.dueDate} />;
}

export function ModuleRowMeta({ moduleKey, spaceId }: { moduleKey: ModuleKey; spaceId: string }) {
  const content = (() => {
    switch (moduleKey) {
      case "exams":
        return <ExamsMeta spaceId={spaceId} />;
      case "assignments":
        return <AssignmentsMeta spaceId={spaceId} />;
      default:
        return null;
    }
  })();
  if (!content) return null;
  return <span className="ml-auto flex items-center gap-1.5">{content}</span>;
}
