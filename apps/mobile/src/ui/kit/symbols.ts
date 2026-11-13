import type { ModuleKey } from "@nookly/shared/modules";
import { MODULE_ICONS } from "../icons.tsx";
import type { TintName } from "../tokens.ts";
import type { FallbackIcon, SymbolName } from "./Glyph.tsx";

export interface BadgeLook {
  symbol: SymbolName;
  fallback: FallbackIcon;
  tint: TintName;
}

/// Each module as iOS would draw it on a badge (D51): an SF Symbol close to the desktop's
/// Tabler icon, that icon where SF Symbols are not, and a tint so a list of mixed things
/// reads at a glance.
export const MODULE_BADGES = {
  tasks: { symbol: "checklist", fallback: MODULE_ICONS.tasks, tint: "blue" },
  notes: { symbol: "note.text", fallback: MODULE_ICONS.notes, tint: "yellow" },
  jots: { symbol: "pencil.line", fallback: MODULE_ICONS.jots, tint: "yellow" },
  courses: { symbol: "book.closed", fallback: MODULE_ICONS.courses, tint: "purple" },
  semesters: { symbol: "calendar", fallback: MODULE_ICONS.semesters, tint: "purple" },
  sessions: { symbol: "person.2.wave.2", fallback: MODULE_ICONS.sessions, tint: "green" },
  calendar: { symbol: "calendar", fallback: MODULE_ICONS.calendar, tint: "red" },
  exams: { symbol: "graduationcap", fallback: MODULE_ICONS.exams, tint: "red" },
  decks: { symbol: "rectangle.stack", fallback: MODULE_ICONS.decks, tint: "pink" },
  assignments: { symbol: "doc.text", fallback: MODULE_ICONS.assignments, tint: "blue" },
  files: { symbol: "doc", fallback: MODULE_ICONS.files, tint: "gray" },
  bookmarks: { symbol: "bookmark", fallback: MODULE_ICONS.bookmarks, tint: "blue" },
  recipes: { symbol: "fork.knife", fallback: MODULE_ICONS.recipes, tint: "green" },
  grades: { symbol: "chart.bar", fallback: MODULE_ICONS.grades, tint: "green" },
  moodle: { symbol: "building.columns", fallback: MODULE_ICONS.moodle, tint: "gray" },
} satisfies Record<ModuleKey, BadgeLook>;
