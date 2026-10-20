import type { EntityRecord } from "@nookly/shared/data";
import { refineJot } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { useLocalWrite } from "../data/context.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
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
      return (
        <MainPart>
          <PageEditor entityId={id} readOnly={readOnly} />
        </MainPart>
      );
    case "jot":
      return (
        <>
          <MainPart>
            <PageEditor entityId={id} readOnly={readOnly} />
          </MainPart>
          <DetailsPart>{readOnly ? null : <RefineButton id={id} />}</DetailsPart>
        </>
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

/// A jot is refined into a new note, linked to it; the jot stays as it is.
function RefineButton({ id }: { id: string }) {
  const router = useRouter();
  const refine = useLocalWrite((db, _: undefined) => refineJot(db, id));
  return (
    <Button
      label="Refine into New Note"
      variant="secondary"
      status={statusOf(refine)}
      errorLabel="Couldn't refine it"
      onPress={() =>
        refine.mutate(undefined, { onSuccess: (note) => router.push(`/entity/${note}`) })
      }
    />
  );
}
