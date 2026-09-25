import type { KeyboardEvent, ReactNode } from "react";

/// Shared grouping for list and board pages (Tasks, Assignments): items split
/// into groups, and optionally each group again into sub-groups. A list nests
/// sub-groups under their group; a board turns groups into columns and
/// sub-groups into swimlanes.

/// One way to split items, like a single status or a single due date bucket.
export interface GroupDef<T> {
  id: string;
  name: string;
  icon?: ReactNode;
  match: (item: T) => boolean;
  /// Starts collapsed, for groups that only hold finished work.
  defaultCollapsed?: boolean;
}

export interface ViewGroup<T> {
  id: string;
  name: string;
  icon?: ReactNode;
  defaultCollapsed?: boolean;
  items: T[];
  /// Every sub-group, empty ones included so board lanes line up; `null`
  /// without sub-grouping.
  subgroups: ViewGroup<T>[] | null;
}

/// Splits `items` (already in display order) by `primary`, then each group by
/// `secondary`. An item matching several groups shows up in each.
export function buildGroups<T>(
  items: T[],
  primary: GroupDef<T>[],
  secondary: GroupDef<T>[] | null,
): ViewGroup<T>[] {
  const toGroup = (def: GroupDef<T>, pool: T[]): ViewGroup<T> => ({
    id: def.id,
    name: def.name,
    icon: def.icon,
    defaultCollapsed: def.defaultCollapsed,
    items: pool.filter(def.match),
    subgroups: null,
  });
  return primary.map((def) => {
    const group = toGroup(def, items);
    return secondary
      ? { ...group, subgroups: secondary.map((sub) => toGroup(sub, group.items)) }
      : group;
  });
}

/// Arrow keys and j/k move between rows or cards (`data-task-row`) in document order.
export function moveRowFocus(e: KeyboardEvent<HTMLElement>) {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.hasAttribute("data-task-row")) return;
  const step =
    e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
  if (step === 0) return;
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-task-row]"));
  const next = rows[rows.indexOf(target) + step];
  if (next) {
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  }
}

/// Collapsed state that starts from each group's `defaultCollapsed`: stores only
/// the ids the user flipped. Sub-group ids are `"<group>/<sub>"`.
export function isCollapsed(
  toggled: Set<string>,
  id: string,
  defaultCollapsed: boolean | undefined,
): boolean {
  return toggled.has(id) !== Boolean(defaultCollapsed);
}

export function toggleId(toggled: Set<string>, id: string): Set<string> {
  const next = new Set(toggled);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
