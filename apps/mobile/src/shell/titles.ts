import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";

const PAGE_TITLES = new Map([
  ["/", "Dashboard"],
  ["/calendar", "Calendar"],
  ["/tasks", "Tasks"],
  ["/assignments", "Assignments"],
  ["/trash", "Trash"],
  ["/search", "Search"],
  ["/pinned", "Pinned"],
  ["/settings", "Settings"],
  ["/conflicts", "Review Changes"],
]);

/// A tab's name from its page, for the pages that are not one item; null for an item,
/// whose own title is the name.
export function titleOfPath(path: string): string | null {
  const known = PAGE_TITLES.get(path);
  if (known) return known;
  const module = /^\/module\/[^/]+\/([^/]+)/.exec(path)?.[1];
  if (module && isModuleKey(module)) return MODULE_LABELS[module];
  if (path.startsWith("/settings")) return "Settings";
  if (path.startsWith("/space/")) return "Space";
  if (path.startsWith("/study/")) return "Study";
  if (path.startsWith("/space-settings/")) return "Space Settings";
  return null;
}
