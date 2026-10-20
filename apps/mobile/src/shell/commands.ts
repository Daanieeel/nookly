import type { ShortcutId } from "./shortcuts.ts";

/// What the command palette can run: open a page or sheet (`route`), or do something to
/// the app (`action`, handled where the palette is shown).
export interface PaletteCommand {
  id: string;
  title: string;
  section: "Go to" | "Create" | "App";
  route?: string;
  action?: "sync" | "toggleSidebar" | "toggleInspector" | "back" | "forward";
  /// Other words someone might type.
  keywords: string[];
  shortcut?: ShortcutId;
}

export const COMMANDS: PaletteCommand[] = [
  { id: "dashboard", title: "Go to Dashboard", section: "Go to", route: "/", keywords: ["home"] },
  {
    id: "calendar",
    title: "Go to Calendar",
    section: "Go to",
    route: "/calendar",
    keywords: ["week", "month", "day", "schedule"],
  },
  {
    id: "tasks",
    title: "Go to Tasks",
    section: "Go to",
    route: "/tasks",
    keywords: ["todo", "board"],
  },
  {
    id: "assignments",
    title: "Go to Assignments",
    section: "Go to",
    route: "/assignments",
    keywords: ["homework", "due"],
  },
  { id: "trash", title: "Go to Trash", section: "Go to", route: "/trash", keywords: ["deleted"] },
  {
    id: "settings",
    title: "Go to Settings",
    section: "Go to",
    route: "/settings",
    keywords: ["preferences", "options", "account"],
    shortcut: "settings",
  },
  {
    id: "conflicts",
    title: "Go to Review Changes",
    section: "Go to",
    route: "/conflicts",
    keywords: ["conflict", "merge", "sync"],
  },
  {
    id: "new-task",
    title: "New Task",
    section: "Create",
    route: "/new/task",
    keywords: ["todo", "add"],
  },
  {
    id: "new-page",
    title: "New Page",
    section: "Create",
    route: "/new/page",
    keywords: ["note", "document", "add"],
  },
  {
    id: "new-jot",
    title: "Quick Jot",
    section: "Create",
    route: "/new/jot",
    keywords: ["capture", "idea", "note"],
    shortcut: "quickJot",
  },
  {
    id: "new-entry",
    title: "New Calendar Entry",
    section: "Create",
    route: "/new/entry",
    keywords: ["event", "appointment", "add"],
  },
  {
    id: "new-bookmark",
    title: "New Bookmark",
    section: "Create",
    route: "/new/bookmark",
    keywords: ["link", "url", "website"],
  },
  {
    id: "import",
    title: "Import a Nookly File",
    section: "Create",
    route: "/new/import",
    keywords: ["open", "load", "file", "bring in"],
  },
  {
    id: "new-space",
    title: "New Space",
    section: "Create",
    route: "/new/space",
    keywords: ["folder", "project"],
  },
  {
    id: "sync",
    title: "Sync Now",
    section: "App",
    action: "sync",
    keywords: ["refresh", "update"],
  },
  {
    id: "sidebar",
    title: "Collapse or Expand the Sidebar",
    section: "App",
    action: "toggleSidebar",
    keywords: ["hide", "show", "left"],
    shortcut: "toggleSidebar",
  },
  {
    id: "inspector",
    title: "Collapse or Expand the Details",
    section: "App",
    action: "toggleInspector",
    keywords: ["hide", "show", "right", "properties", "relationships"],
    shortcut: "toggleInspector",
  },
  {
    id: "back",
    title: "Go Back",
    section: "App",
    action: "back",
    keywords: ["previous"],
    shortcut: "back",
  },
  {
    id: "forward",
    title: "Go Forward",
    section: "App",
    action: "forward",
    keywords: ["next"],
    shortcut: "forward",
  },
];

/// Commands matching `query`: every word typed has to match. Titles that begin with the
/// whole query come first, then titles with words that begin with the typed words, then
/// titles that contain them, then synonyms. Everything before anything is typed.
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  const typed = needle.split(/\s+/);
  const rank = (command: PaletteCommand): number => {
    const title = command.title.toLowerCase();
    const words = title.split(" ");
    if (title.startsWith(needle)) return 0;
    if (typed.every((t) => words.some((word) => word.startsWith(t)))) return 1;
    if (typed.every((t) => title.includes(t))) return 2;
    const rest = [title, ...command.keywords];
    if (typed.every((t) => rest.some((word) => word.includes(t)))) return 3;
    return -1;
  };
  return commands
    .map((command, order) => ({ command, order, score: rank(command) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((item) => item.command);
}
