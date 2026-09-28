import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AssignmentDetailView } from "#/features/assignments/AssignmentDetailView.tsx";
import { CalendarEntryDetailView } from "#/features/calendar-entries/CalendarEntryDetailView.tsx";
import { CourseDetailView } from "#/features/courses/CourseDetailView.tsx";
import { SemesterDetailView } from "#/features/courses/SemesterDetailView.tsx";
import { DeckDetailView } from "#/features/exams/DeckDetailView.tsx";
import { ExamDetailView } from "#/features/exams/ExamDetailView.tsx";
import { FileDetailView } from "#/features/files/FileDetailView.tsx";
import { PageDetailView } from "#/features/notes/PageDetailView.tsx";
import { RecipeDetailView } from "#/features/recipes/RecipeDetailView.tsx";
import { TaskDetailView } from "#/features/tasks/TaskDetailView.tsx";
import { getEntity } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { getView } from "#/lib/api/views.ts";
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
      return <PageDetailView entity={entity} />;
    case "exam":
      return <ExamDetailView entity={entity} />;
    case "calendar_entry":
      return <CalendarEntryDetailView entity={entity} />;
    case "index_card_deck":
      return <DeckDetailView entity={entity} />;
    case "assignment":
      return <AssignmentDetailView entity={entity} />;
    case "course":
      return <CourseDetailView entity={entity} />;
    case "semester":
      return <SemesterDetailView entity={entity} />;
    case "file":
      return <FileDetailView entity={entity} />;
    case "recipe":
      return <RecipeDetailView entity={entity} />;
    case "bookmark":
      return <BookmarkRedirect entity={entity} />;
    case "view":
      return <SavedViewRedirect entity={entity} />;
    default:
      return <GenericDetailView entity={entity} />;
  }
}

/// Bookmarks open in the details sheet, never as a page.
function BookmarkRedirect({ entity }: { entity: Entity }) {
  const showBookmark = useNavStore((s) => s.showBookmark);
  useEffect(
    () => showBookmark(entity.id, entity.spaceId),
    [entity.id, entity.spaceId, showBookmark],
  );
  return null;
}

/// Saved Views open as their module page, never as a page of their own.
function SavedViewRedirect({ entity }: { entity: Entity }) {
  const showSavedView = useNavStore((s) => s.showSavedView);
  const { data: view } = useQuery({
    queryKey: ["view", entity.id],
    queryFn: () => getView(entity.id),
  });
  useEffect(() => {
    if (view) showSavedView(entity.id, entity.spaceId, view.module);
  }, [view, entity.id, entity.spaceId, showSavedView]);
  return null;
}
