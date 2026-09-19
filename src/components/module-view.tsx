import { AssignmentsListView } from "@/features/assignments/AssignmentsListView";
import { BookmarksListView } from "@/features/bookmarks/BookmarksListView";
import { CoursesListView } from "@/features/courses/CoursesListView";
import { ExamsListView } from "@/features/exams/ExamsListView";
import { FilesListView } from "@/features/files/FilesListView";
import { JotsListView } from "@/features/notes/JotsListView";
import { NotesListView } from "@/features/notes/NotesListView";
import { SessionsListView } from "@/features/sessions/SessionsListView";
import { TasksListView } from "@/features/tasks/TasksListView";
import type { ModuleKey } from "@/lib/store/nav";

export function ModuleView({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
  switch (module) {
    case "tasks":
      return <TasksListView spaceId={spaceId} />;
    case "notes":
      return <NotesListView spaceId={spaceId} />;
    case "jots":
      return <JotsListView spaceId={spaceId} />;
    case "courses":
      return <CoursesListView spaceId={spaceId} />;
    case "sessions":
      return <SessionsListView spaceId={spaceId} />;
    case "exams":
      return <ExamsListView spaceId={spaceId} />;
    case "assignments":
      return <AssignmentsListView spaceId={spaceId} />;
    case "files":
      return <FilesListView spaceId={spaceId} />;
    case "bookmarks":
      return <BookmarksListView spaceId={spaceId} />;
  }
}
