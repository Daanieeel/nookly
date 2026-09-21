import {
  IconBook2,
  IconBookmark,
  IconCalendarStats,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconFeather,
  IconFile,
  IconNotes,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import { type ModuleKey, MODULE_KEYS } from "@/lib/store/nav";

export { MODULE_KEYS };
export type { ModuleKey };

export const MODULE_LABELS = {
  tasks: "Tasks",
  notes: "Notes",
  jots: "Jots & Refinements",
  courses: "Courses",
  sessions: "Sessions",
  exams: "Exams",
  assignments: "Assignments",
  files: "Files",
  bookmarks: "Bookmarks",
} satisfies Record<ModuleKey, string>;

export const MODULE_DESCRIPTIONS = {
  tasks: "Track to-dos on a board or list, grouped by status.",
  notes: "Write freeform pages with headings, lists, and blocks.",
  jots: "Capture quick thoughts and refine them later.",
  courses: "Organize a course into semesters and materials.",
  sessions: "Plan study or work sessions with reusable templates.",
  exams: "Build index-card decks and study blocks for exams.",
  assignments: "Track assignments with due dates and progress.",
  files: "Keep reference files and documents in one place.",
  bookmarks: "Save links you want to come back to.",
} satisfies Record<ModuleKey, string>;

export const MODULE_ICONS = {
  tasks: IconChecklist,
  notes: IconNotes,
  jots: IconFeather,
  courses: IconBook2,
  sessions: IconChalkboard,
  exams: IconCalendarStats,
  assignments: IconClipboardList,
  files: IconFile,
  bookmarks: IconBookmark,
} satisfies Record<ModuleKey, TablerIcon>;

/// Which underlying entity `type`s belong to each module. Mirrors
/// `module_key_for_entity_type` in `src-tauri/src/db/space_modules.rs` — keep
/// the two in sync.
export const MODULE_ENTITY_TYPES = {
  tasks: ["task", "sub_task"],
  notes: ["note"],
  jots: ["jot", "refinement"],
  courses: ["course", "semester"],
  sessions: ["session", "session_template"],
  exams: ["exam", "index_card_deck", "study_block"],
  assignments: ["assignment"],
  files: ["file"],
  bookmarks: ["bookmark"],
} satisfies Record<ModuleKey, string[]>;

export function moduleForEntityType(type: string): ModuleKey | undefined {
  return MODULE_KEYS.find((key) =>
    // SAFETY: widening to `string[]` only relaxes `.includes`'s parameter type —
    // `type` is an arbitrary runtime string here (an entity's `type` column),
    // and a non-match just falls through to `false` like any other string.
    (MODULE_ENTITY_TYPES[key] as string[]).includes(type),
  );
}
