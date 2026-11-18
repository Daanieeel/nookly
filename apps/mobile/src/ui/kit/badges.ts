import type { ModuleKey } from "@nookly/shared/modules";
import { MODULE_ICONS } from "../icons.tsx";
import type { TintName } from "../tokens.ts";
import type { GlyphIcon } from "./Glyph.tsx";

export interface BadgeLook {
  glyph: GlyphIcon;
  tint: TintName;
}

/// Each module on a badge: the desktop's own icon for it, and a tint so a list of mixed
/// things reads at a glance.
export const MODULE_BADGES = {
  tasks: { glyph: MODULE_ICONS.tasks, tint: "blue" },
  notes: { glyph: MODULE_ICONS.notes, tint: "yellow" },
  jots: { glyph: MODULE_ICONS.jots, tint: "yellow" },
  courses: { glyph: MODULE_ICONS.courses, tint: "purple" },
  semesters: { glyph: MODULE_ICONS.semesters, tint: "purple" },
  sessions: { glyph: MODULE_ICONS.sessions, tint: "green" },
  calendar: { glyph: MODULE_ICONS.calendar, tint: "red" },
  exams: { glyph: MODULE_ICONS.exams, tint: "red" },
  decks: { glyph: MODULE_ICONS.decks, tint: "pink" },
  assignments: { glyph: MODULE_ICONS.assignments, tint: "blue" },
  files: { glyph: MODULE_ICONS.files, tint: "gray" },
  bookmarks: { glyph: MODULE_ICONS.bookmarks, tint: "blue" },
  recipes: { glyph: MODULE_ICONS.recipes, tint: "green" },
  grades: { glyph: MODULE_ICONS.grades, tint: "green" },
  moodle: { glyph: MODULE_ICONS.moodle, tint: "gray" },
} satisfies Record<ModuleKey, BadgeLook>;
