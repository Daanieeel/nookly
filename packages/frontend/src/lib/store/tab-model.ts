import type { View } from "./nav.ts";

/// A tab: one view with its own Back and Forward history. `V` is what a page is: the
/// desktop's `View`, the iPad's route path.
export interface Tab<V = View> {
  id: string;
  view: V;
  backStack: V[];
  forwardStack: V[];
  pinned: boolean;
}

export function makeTab(view: View, pinned = false): Tab {
  return { id: crypto.randomUUID(), view, backStack: [], forwardStack: [], pinned };
}

/// Pinned tabs always sit first, in their own order.
export function pinnedFirst<T extends { pinned: boolean }>(tabs: T[]): T[] {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

/// The tab to show once `closedId` goes: the one that takes its place on the right,
/// else the one on its left.
export function tabAfterClose<T extends { id: string }>(
  tabs: T[],
  closedId: string,
): T | undefined {
  const index = tabs.findIndex((t) => t.id === closedId);
  return tabs[index + 1] ?? tabs[index - 1];
}

/// Moves a tab to `toIndex`, keeping pinned tabs first.
export function moveTab<T extends { id: string; pinned: boolean }>(
  tabs: T[],
  id: string,
  toIndex: number,
): T[] {
  const from = tabs.findIndex((t) => t.id === id);
  if (from === -1) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
  return pinnedFirst(next);
}
