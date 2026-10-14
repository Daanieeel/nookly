/// Nookly's modules as people see them, the same on every client: their keys, names,
/// and the entity types each one holds. Icons are named by their Tabler icon, which
/// each client draws from its own Tabler package.

export const MODULE_KEYS = [
  "tasks",
  "notes",
  "jots",
  "courses",
  "semesters",
  "sessions",
  "calendar",
  "exams",
  "decks",
  "assignments",
  "files",
  "bookmarks",
  "recipes",
  "grades",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS = {
  tasks: "Tasks",
  notes: "Notes",
  jots: "Jots",
  courses: "Courses",
  semesters: "Semesters",
  sessions: "Sessions",
  calendar: "Calendar",
  exams: "Exams",
  decks: "Decks",
  assignments: "Assignments",
  files: "Files",
  bookmarks: "Bookmarks",
  recipes: "Recipes",
  grades: "Grades",
} satisfies Record<ModuleKey, string>;

/// Which entity `type`s belong to each module, like `module_keys_for_entity_type` on
/// the desktop (a test checks the two against each other).
export const MODULE_ENTITY_TYPES = {
  tasks: ["task", "sub_task"],
  notes: ["note"],
  jots: ["jot"],
  courses: ["course", "course_notes"],
  semesters: ["semester"],
  sessions: ["session", "session_template"],
  calendar: ["calendar_entry", "calendar_entry_template"],
  exams: ["exam", "study_block"],
  decks: ["index_card_deck"],
  assignments: ["assignment"],
  files: ["file"],
  bookmarks: ["bookmark"],
  recipes: ["recipe"],
  // A report on Exams and Assignments, with no entities of its own.
  grades: [],
} satisfies Record<ModuleKey, string[]>;

export function isModuleKey(key: string): key is ModuleKey {
  return MODULE_KEYS.some((k) => k === key);
}

export function moduleForEntityType(type: string): ModuleKey | undefined {
  return MODULE_KEYS.find((key) => MODULE_ENTITY_TYPES[key].some((t: string) => t === type));
}
