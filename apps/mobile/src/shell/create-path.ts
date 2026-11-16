import { type ModuleKey, isModuleKey } from "@nookly/shared/modules";

/// The create form of each module's list, by its route under `app/new`.
const CREATE: Partial<Record<ModuleKey, string>> = {
  tasks: "task",
  notes: "page",
  jots: "jot",
  courses: "course",
  semesters: "semester",
  sessions: "session",
  calendar: "entry",
  exams: "exam",
  decks: "deck",
  assignments: "assignment",
  files: "import",
  bookmarks: "bookmark",
  recipes: "recipe",
};

const PAGES = new Map([
  ["/tasks", "/new/task"],
  ["/calendar", "/new/entry"],
  ["/assignments", "/new/assignment"],
]);

/// Where the desktop's New (`Cmd+N`) goes from `path`: the create form of the list or
/// calendar shown, in its Space; a new page anywhere else.
export function createPathFor(path: string): string {
  const base = path.split("?")[0];
  const page = PAGES.get(base);
  if (page) return page;
  const [, spaceId, module] = /^\/module\/([^/]+)\/([^/]+)/.exec(base) ?? [];
  if (!spaceId) return "/new/page";
  const form = module && isModuleKey(module) ? CREATE[module] : undefined;
  return `/new/${form ?? "page"}?spaceId=${spaceId}`;
}
