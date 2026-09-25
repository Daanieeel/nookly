import { AssignmentsListView } from "#/features/assignments/AssignmentsListView.tsx";
import { BookmarksListView } from "#/features/bookmarks/BookmarksListView.tsx";
import { CoursesListView } from "#/features/courses/CoursesListView.tsx";
import { SemestersListView } from "#/features/courses/SemestersListView.tsx";
import { DecksListView } from "#/features/exams/DecksListView.tsx";
import { ExamsListView } from "#/features/exams/ExamsListView.tsx";
import { FilesListView } from "#/features/files/FilesListView.tsx";
import { JotsListView } from "#/features/notes/JotsListView.tsx";
import { NotesListView } from "#/features/notes/NotesListView.tsx";
import { SessionsListView } from "#/features/sessions/SessionsListView.tsx";
import { TasksListView } from "#/features/tasks/TasksListView.tsx";
import type { ModuleKey } from "#/lib/store/nav.ts";

export function ModuleView({
  spaceId,
  module,
  filterCourseId,
}: {
  spaceId: string;
  module: ModuleKey;
  filterCourseId?: string;
}) {
  switch (module) {
    case "tasks":
      return <TasksListView spaceId={spaceId} />;
    case "notes":
      return <NotesListView spaceId={spaceId} />;
    case "jots":
      return <JotsListView spaceId={spaceId} />;
    case "courses":
      return <CoursesListView spaceId={spaceId} />;
    case "semesters":
      return <SemestersListView spaceId={spaceId} />;
    case "sessions":
      return <SessionsListView spaceId={spaceId} filterCourseId={filterCourseId} />;
    case "exams":
      return <ExamsListView spaceId={spaceId} filterCourseId={filterCourseId} />;
    case "decks":
      return <DecksListView spaceId={spaceId} />;
    case "assignments":
      return <AssignmentsListView spaceId={spaceId} filterCourseId={filterCourseId} />;
    case "files":
      return <FilesListView spaceId={spaceId} />;
    case "bookmarks":
      return <BookmarksListView spaceId={spaceId} />;
  }
}
