import { useQuery } from "@tanstack/react-query";
import { AssignmentDetailView } from "@/features/assignments/AssignmentDetailView";
import { CourseDetailView } from "@/features/courses/CourseDetailView";
import { SemesterDetailView } from "@/features/courses/SemesterDetailView";
import { DeckDetailView } from "@/features/exams/DeckDetailView";
import { ExamDetailView } from "@/features/exams/ExamDetailView";
import { PageDetailView } from "@/features/notes/PageDetailView";
import { TaskDetailView } from "@/features/tasks/TaskDetailView";
import { getEntity } from "@/lib/api/entities";
import { GenericDetailView } from "./generic-detail-view";

export function EntityDetailRouter({ entityId }: { entityId: string }) {
  const { data: entity, isLoading } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => getEntity(entityId),
  });

  if (isLoading || !entity) {
    return <div className="flex-1 p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  switch (entity.type) {
    case "task":
    case "sub_task":
      return <TaskDetailView entity={entity} />;
    case "note":
    case "jot":
    case "refinement":
      return <PageDetailView entity={entity} />;
    case "exam":
      return <ExamDetailView entity={entity} />;
    case "index_card_deck":
      return <DeckDetailView entity={entity} />;
    case "assignment":
      return <AssignmentDetailView entity={entity} />;
    case "course":
      return <CourseDetailView entity={entity} />;
    case "semester":
      return <SemesterDetailView entity={entity} />;
    default:
      return <GenericDetailView entity={entity} />;
  }
}
