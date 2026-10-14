import {
  IconBook2,
  IconBookmark,
  IconCalendarEvent,
  IconCalendarStats,
  IconCalendarWeek,
  IconCards,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconFeather,
  IconFile,
  IconNotes,
  IconReportAnalytics,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import type { Entity } from "#/lib/api/types.ts";
import { type ModuleKey, MODULE_KEYS, type View } from "#/lib/store/nav.ts";

export { MODULE_KEYS };
export type { ModuleKey };

export { MODULE_LABELS } from "@nookly/shared/modules";

export const MODULE_DESCRIPTIONS = {
  tasks: "Track to-dos on a board or list, grouped by status.",
  notes: "Write freeform pages with headings, lists, and blocks.",
  jots: "Capture quick thoughts and refine them into Notes later.",
  courses: "Organize a course into semesters and materials.",
  semesters: "Group courses by term and see what's in each one.",
  sessions: "Plan study or work sessions with reusable templates.",
  calendar: "Add one-off or recurring personal calendar entries.",
  exams: "Count down to exams and plan study blocks for them.",
  decks: "Write flash cards and study them with spaced repetition.",
  assignments: "Track assignments with due dates and progress.",
  files: "Keep reference files and documents in one place.",
  bookmarks: "Save links you want to come back to.",
  recipes: "Track recipes with ingredients and steps.",
  grades: "See your grades and averages by course and semester.",
} satisfies Record<ModuleKey, string>;

export const MODULE_ICONS = {
  tasks: IconChecklist,
  notes: IconNotes,
  jots: IconFeather,
  courses: IconBook2,
  semesters: IconCalendarWeek,
  sessions: IconChalkboard,
  calendar: IconCalendarEvent,
  exams: IconCalendarStats,
  decks: IconCards,
  assignments: IconClipboardList,
  files: IconFile,
  bookmarks: IconBookmark,
  recipes: IconToolsKitchen2,
  grades: IconReportAnalytics,
} satisfies Record<ModuleKey, TablerIcon>;

import { MODULE_ENTITY_TYPES } from "@nookly/shared/modules";

export { MODULE_ENTITY_TYPES };

/// Modules that ride along with another module rather than being offered on
/// their own in the sidebar's "+" picker — e.g. Semesters only exists to
/// organize Courses, so it's added the moment Courses is (explicitly, or by
/// creating a first course/semester) and never shown as a separate choice.
export const MODULE_PASSENGERS = new Map<ModuleKey, ModuleKey[]>([["courses", ["semesters"]]]);

import { moduleForEntityType } from "@nookly/shared/modules";

export { moduleForEntityType };

/// Where to land after trashing the entity being viewed: its module's list, e.g.
/// the Tasks board for a Task, or the Dashboard when it has no module.
export function viewAfterTrash(entity: Entity): View {
  const module = moduleForEntityType(entity.type);
  return module ? { kind: "module", spaceId: entity.spaceId, module } : { kind: "dashboard" };
}
