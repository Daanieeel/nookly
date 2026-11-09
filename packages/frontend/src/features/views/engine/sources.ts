import { assignmentSource } from "./sources/assignments.tsx";
import { examSource } from "./sources/exams.tsx";
import { jotSource, noteSource } from "./sources/pages.tsx";
import { taskSource } from "./sources/tasks.tsx";

/// Every entity type the view engine can show, by type. A new type registers its
/// `ViewSource` here; a page then embeds it with `EntityView` (`engine/EntityView.tsx`).
export const VIEW_SOURCES = {
  task: taskSource,
  assignment: assignmentSource,
  exam: examSource,
  note: noteSource,
  jot: jotSource,
} as const;

export type ViewSourceType = keyof typeof VIEW_SOURCES;
