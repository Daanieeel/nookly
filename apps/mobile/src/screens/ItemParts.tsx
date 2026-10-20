import type { EntityRecord } from "@nookly/shared/data";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { BookmarkDetail } from "./BookmarkDetail.tsx";
import { CalendarEntryDetail } from "./CalendarEntryDetail.tsx";
import { FileDetail } from "./FileScreens.tsx";
import { PageEditor } from "./PageEditor.tsx";
import { SemesterDetail, SessionDetail, StudyBlockDetail } from "./PlannerScreens.tsx";
import { RecipeDetail } from "./RecipeScreens.tsx";
import { AssignmentDetail, CourseDetail, DeckDetail, ExamDetail } from "./StudyDetail.tsx";
import { TaskItem } from "./TaskDetail.tsx";

/// What an item shows of itself by its type. The same element stands in the page (inside a
/// `PartProvider` for "main") and in the details (for "details"): each type marks what
/// belongs in the middle (`MainPart`) and what is a property or setting (`DetailsPart`).
export function ItemParts({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const id = entity.id;
  switch (entity.type) {
    case "task":
    case "sub_task":
      return <TaskItem id={id} readOnly={readOnly} sub={entity.type === "sub_task"} />;
    case "note":
    case "jot":
      return (
        <MainPart>
          <PageEditor entityId={id} readOnly={readOnly} />
        </MainPart>
      );
    case "file":
      return <FileDetail id={id} />;
    case "session":
      return <SessionDetail id={id} readOnly={readOnly} />;
    case "study_block":
      return <StudyBlockDetail id={id} readOnly={readOnly} />;
    case "semester":
      return <SemesterDetail id={id} readOnly={readOnly} />;
    case "recipe":
      return <RecipeDetail id={id} readOnly={readOnly} />;
    case "bookmark":
      return <BookmarkDetail id={id} readOnly={readOnly} />;
    case "calendar_entry":
      return <CalendarEntryDetail id={id} readOnly={readOnly} />;
    case "course":
      return <CourseDetail id={id} readOnly={readOnly} />;
    case "exam":
      return <ExamDetail id={id} readOnly={readOnly} />;
    case "assignment":
      return <AssignmentDetail id={id} readOnly={readOnly} />;
    case "index_card_deck":
      return <DeckDetail id={id} readOnly={readOnly} />;
    default:
      return (
        <>
          <MainPart>{null}</MainPart>
          <DetailsPart>{null}</DetailsPart>
        </>
      );
  }
}
