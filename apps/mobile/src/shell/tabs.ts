import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import { z } from "zod";

/// The iPad's tabs, like the desktop's: each remembers the page it is on, and may hold a
/// second page beside it. Pure: the screen keeps the state and saves it.

export interface Tab {
  id: string;
  path: string;
  /// A second page shown beside this one (split view), or null.
  right: string | null;
}

export interface TabsState {
  tabs: Tab[];
  active: string;
}

const tabSchema = z.object({ id: z.string(), path: z.string(), right: z.string().nullable() });
const stateSchema = z.object({ tabs: z.array(tabSchema).min(1), active: z.string() });

export function startTabs(newId: () => string): TabsState {
  const id = newId();
  return { tabs: [{ id, path: "/", right: null }], active: id };
}

/// What was saved, or one fresh tab when it is not readable.
export function parseTabs(saved: string | null, newId: () => string): TabsState {
  try {
    const parsed = stateSchema.safeParse(saved ? JSON.parse(saved) : null);
    if (parsed.success && parsed.data.tabs.some((t) => t.id === parsed.data.active)) {
      return parsed.data;
    }
  } catch {
    // Not JSON; start again.
  }
  return startTabs(newId);
}

const SHEET = /^\/(new|pick)\//;

/// The router shows `path`: the tab that is open is on it now.
export function visit(state: TabsState, path: string): TabsState {
  if (SHEET.test(path)) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === state.active ? { ...t, path } : t)),
  };
}

/// A new tab on the dashboard, beside the open one, and open.
export function newTab(state: TabsState, newId: () => string): TabsState {
  const id = newId();
  const at = state.tabs.findIndex((t) => t.id === state.active) + 1;
  const tabs = [
    ...state.tabs.slice(0, at),
    { id, path: "/", right: null },
    ...state.tabs.slice(at),
  ];
  return { tabs, active: id };
}

export function selectTab(state: TabsState, id: string): TabsState {
  return state.tabs.some((t) => t.id === id) ? { ...state, active: id } : state;
}

/// Closes a tab; the one beside it (before, else after) takes over. The last one closed
/// leaves a new dashboard.
export function closeTab(state: TabsState, id: string): TabsState {
  const at = state.tabs.findIndex((t) => t.id === id);
  if (at === -1) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (tabs.length === 0) return startTabs(() => `${id}-again`);
  if (state.active !== id) return { ...state, tabs };
  return { tabs, active: (tabs[at - 1] ?? tabs[at]).id };
}

export function closeOtherTabs(state: TabsState, keep: string): TabsState {
  const kept = state.tabs.filter((t) => t.id === keep);
  return kept.length === 0 ? state : { tabs: kept, active: keep };
}

/// The tab `offset` places along, round the ends.
export function selectOffset(state: TabsState, offset: number): TabsState {
  const at = state.tabs.findIndex((t) => t.id === state.active);
  const count = state.tabs.length;
  return { ...state, active: state.tabs[(at + offset + count) % count].id };
}

/// The open tab's second page.
export function setRightPane(state: TabsState, path: string | null): TabsState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === state.active ? { ...t, right: path } : t)),
  };
}

const PAGE_TITLES = new Map([
  ["/", "Dashboard"],
  ["/calendar", "Calendar"],
  ["/tasks", "Tasks"],
  ["/assignments", "Assignments"],
  ["/trash", "Trash"],
  ["/search", "Search"],
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
  return null;
}
