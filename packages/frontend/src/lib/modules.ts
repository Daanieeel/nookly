import {
  IconBook2,
  IconBookmark,
  IconCalendarStats,
  IconCalendarWeek,
  IconCards,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconFeather,
  IconFile,
  IconNotes,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import type { Entity } from "#/lib/api/types.ts";
import { type ModuleKey, MODULE_KEYS, type View } from "#/lib/store/nav.ts";

export { MODULE_KEYS };
export type { ModuleKey };

export const MODULE_LABELS = {
  tasks: "Tasks",
  notes: "Notes",
  jots: "Jots",
  courses: "Courses",
  semesters: "Semesters",
  sessions: "Sessions",
  exams: "Exams",
  decks: "Decks",
  assignments: "Assignments",
  files: "Files",
  bookmarks: "Bookmarks",
} satisfies Record<ModuleKey, string>;

export const MODULE_DESCRIPTIONS = {
  tasks: "Track to-dos on a board or list, grouped by status.",
  notes: "Write freeform pages with headings, lists, and blocks.",
  jots: "Capture quick thoughts and refine them into Notes later.",
  courses: "Organize a course into semesters and materials.",
  semesters: "Group courses by term and see what's in each one.",
  sessions: "Plan study or work sessions with reusable templates.",
  exams: "Count down to exams and plan study blocks for them.",
  decks: "Write flash cards and study them with spaced repetition.",
  assignments: "Track assignments with due dates and progress.",
  files: "Keep reference files and documents in one place.",
  bookmarks: "Save links you want to come back to.",
} satisfies Record<ModuleKey, string>;

export const MODULE_ICONS = {
  tasks: IconChecklist,
  notes: IconNotes,
  jots: IconFeather,
  courses: IconBook2,
  semesters: IconCalendarWeek,
  sessions: IconChalkboard,
  exams: IconCalendarStats,
  decks: IconCards,
  assignments: IconClipboardList,
  files: IconFile,
  bookmarks: IconBookmark,
} satisfies Record<ModuleKey, TablerIcon>;

/// Which underlying entity `type`s belong to each module. Mirrors
/// `module_keys_for_entity_type` in `src-tauri/src/db/space_modules.rs` — keep
/// the two in sync.
export const MODULE_ENTITY_TYPES = {
  tasks: ["task", "sub_task"],
  notes: ["note"],
  jots: ["jot"],
  courses: ["course", "course_notes"],
  semesters: ["semester"],
  sessions: ["session", "session_template"],
  exams: ["exam", "study_block"],
  decks: ["index_card_deck"],
  assignments: ["assignment"],
  files: ["file"],
  bookmarks: ["bookmark"],
} satisfies Record<ModuleKey, string[]>;

/// Modules that ride along with another module rather than being offered on
/// their own in the sidebar's "+" picker — e.g. Semesters only exists to
/// organize Courses, so it's added the moment Courses is (explicitly, or by
/// creating a first course/semester) and never shown as a separate choice.
export const MODULE_PASSENGERS = new Map<ModuleKey, ModuleKey[]>([["courses", ["semesters"]]]);

export function moduleForEntityType(type: string): ModuleKey | undefined {
  return MODULE_KEYS.find((key) =>
    // SAFETY: widening to `string[]` only relaxes `.includes`'s parameter type —
    // `type` is an arbitrary runtime string here (an entity's `type` column),
    // and a non-match just falls through to `false` like any other string.
    (MODULE_ENTITY_TYPES[key] as string[]).includes(type),
  );
}

/// Where to land after trashing the entity being viewed: its module's list, e.g.
/// the Tasks board for a Task, or the Dashboard when it has no module.
export function viewAfterTrash(entity: Entity): View {
  const module = moduleForEntityType(entity.type);
  return module ? { kind: "module", spaceId: entity.spaceId, module } : { kind: "dashboard" };
}
