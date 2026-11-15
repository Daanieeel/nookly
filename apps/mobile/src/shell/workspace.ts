import {
  type TabLayout,
  activateTab,
  activeTab,
  addTab,
  closeOtherTabs as closeOthersIn,
  closeTab as closeIn,
  cycleTab as cycleIn,
  focusGroup as focusIn,
  focusedGroup,
  groupOfTab,
  moveTabToGroup,
  pinTab as pinIn,
  reorderTab as reorderIn,
  splitLeft as splitLeftIn,
  splitRight as splitRightIn,
  updateTab,
  type GroupTarget,
  type TabGroup,
  DEFAULT_SPLIT_RATIO,
  clampSplitRatio,
} from "@nookly/frontend/lib/store/tab-groups";
import type { Tab } from "@nookly/frontend/lib/store/tab-model";
import { z } from "zod";
import { SPLIT_MIN_GROUP } from "../ui/pane.tsx";

/// The tablet's window, as the desktop's (D83): up to two groups of tabs side by side, each
/// tab a page with its own Back and Forward. A page is a route's path (`/entity/abc`,
/// `/moodle/forum/3?courseId=2`). Pure: the store in `workspace-store.ts` keeps it and
/// saves it, the shell shows it. The groups are the desktop's own (`tab-groups.ts`).

export type Page = string;
export type PageTab = Tab<Page>;
export type PageGroup = TabGroup<Page>;

export interface Workspace {
  layout: TabLayout<Page>;
  /// Per group, the tab an item picked from a list opens in (`open(..., "beside")`), which
  /// the next one picked replaces until it is kept: VS Code's preview tab.
  preview: Record<string, string>;
  /// The left group's share of the width while both show.
  splitRatio: number;
  /// Whether the focused group fills the window with the other hidden. Not saved.
  zoomed: boolean;
}

/// Where a page opens: in the tab shown (a tap), in a new tab, as a tab of its own in the
/// other group (Open on the Right), or beside the list it was picked from as the other
/// group's preview tab (list beside item, 1.6).
export type Where = "here" | "newTab" | "right" | "beside";

function makePageTab(view: Page, newId: () => string, backStack: Page[] = []): PageTab {
  return { id: newId(), view, backStack, forwardStack: [], pinned: false };
}

export function newWorkspace(newId: () => string): Workspace {
  const tab = makePageTab("/", newId);
  const group: PageGroup = { id: newId(), tabs: [tab], activeTabId: tab.id };
  return {
    layout: { groups: [group], focusedGroupId: group.id },
    preview: {},
    splitRatio: DEFAULT_SPLIT_RATIO,
    zoomed: false,
  };
}

export function focusedTab(ws: Workspace): PageTab {
  return activeTab(focusedGroup(ws.layout));
}

/// The page of the focused group's tab: what the router would be showing.
export function activePath(ws: Workspace): Page {
  return focusedTab(ws).view;
}

function withLayout(ws: Workspace, layout: TabLayout<Page>): Workspace {
  if (layout === ws.layout) return ws;
  // A preview of a group or tab that is gone is forgotten.
  const preview = Object.fromEntries(
    Object.entries(ws.preview).filter(([groupId, tabId]) =>
      layout.groups.some((g) => g.id === groupId && g.tabs.some((t) => t.id === tabId)),
    ),
  );
  return {
    ...ws,
    layout,
    preview,
    zoomed: ws.zoomed && layout.groups.length > 1,
  };
}

/// One step forward in a tab's history.
function go(tab: PageTab, path: Page): PageTab {
  return { ...tab, view: path, backStack: [...tab.backStack, tab.view], forwardStack: [] };
}

export function open(ws: Workspace, path: Page, where: Where, newId: () => string): Workspace {
  const group = focusedGroup(ws.layout);
  const tab = activeTab(group);
  switch (where) {
    case "here": {
      if (tab.view === path) return ws;
      const next = withLayout(
        ws,
        updateTab(ws.layout, tab.id, (t) => go(t, path)),
      );
      // A preview that moves on is one someone is using: keep it.
      return keepPreview(next, tab.id);
    }
    case "newTab":
      return withLayout(ws, addTab(ws.layout, makePageTab(path, newId), true));
    case "right": {
      const created = splitRightIn(ws.layout, tab.id, makePageTab(path, newId));
      // Already the right group: open it there as a tab of its own.
      if (created === ws.layout) return open(ws, path, "newTab", newId);
      return withLayout(ws, created);
    }
    case "beside": {
      const other = ws.layout.groups.find((g) => g.id !== group.id);
      if (!other) {
        const fresh = makePageTab(path, newId);
        const layout = splitRightIn(ws.layout, tab.id, fresh);
        const right = groupOfTab(layout, fresh.id);
        if (!right) return ws;
        return {
          ...withLayout(ws, { ...layout, focusedGroupId: group.id }),
          preview: { ...ws.preview, [right.id]: fresh.id },
        };
      }
      const previewId = ws.preview[other.id];
      const preview = other.tabs.find((t) => t.id === previewId);
      if (preview) {
        if (preview.view === path && other.activeTabId === preview.id) return ws;
        const replaced = updateTab(ws.layout, preview.id, (t) => ({
          ...t,
          view: path,
          backStack: [],
          forwardStack: [],
        }));
        return withLayout(ws, {
          groups: replaced.groups.map((g) =>
            g.id === other.id ? { ...g, activeTabId: preview.id } : g,
          ),
          focusedGroupId: group.id,
        });
      }
      const fresh = makePageTab(path, newId);
      const groups = ws.layout.groups.map((g) =>
        g.id === other.id ? { ...g, tabs: [...g.tabs, fresh], activeTabId: fresh.id } : g,
      );
      return {
        ...withLayout(ws, { groups, focusedGroupId: group.id }),
        preview: { ...ws.preview, [other.id]: fresh.id },
      };
    }
  }
}

/// The router showed the page this tab had before: the same as Back.
export function back(ws: Workspace): Workspace {
  const tab = focusedTab(ws);
  const previous = tab.backStack.at(-1);
  if (previous === undefined) return ws;
  return withLayout(
    ws,
    updateTab(ws.layout, tab.id, (t) => ({
      ...t,
      view: previous,
      backStack: t.backStack.slice(0, -1),
      forwardStack: [...t.forwardStack, t.view],
    })),
  );
}

export function forward(ws: Workspace): Workspace {
  const tab = focusedTab(ws);
  const next = tab.forwardStack.at(-1);
  if (next === undefined) return ws;
  return withLayout(
    ws,
    updateTab(ws.layout, tab.id, (t) => ({
      ...t,
      view: next,
      backStack: [...t.backStack, t.view],
      forwardStack: t.forwardStack.slice(0, -1),
    })),
  );
}

/// The preview tab is edited or pinned: it stays when the next item is picked.
export function keepPreview(ws: Workspace, tabId: string): Workspace {
  if (!Object.values(ws.preview).includes(tabId)) return ws;
  return {
    ...ws,
    preview: Object.fromEntries(Object.entries(ws.preview).filter(([, id]) => id !== tabId)),
  };
}

export function selectTab(ws: Workspace, tabId: string): Workspace {
  return withLayout(ws, activateTab(ws.layout, tabId));
}

export function focusGroup(ws: Workspace, groupId: string): Workspace {
  return withLayout(ws, focusIn(ws.layout, groupId));
}

export function cycleTab(ws: Workspace, step: 1 | -1): Workspace {
  return withLayout(ws, cycleIn(ws.layout, step));
}

export function closeTab(ws: Workspace, tabId: string, newId: () => string): Workspace {
  return withLayout(
    ws,
    closeIn(ws.layout, tabId, () => makePageTab("/", newId)),
  );
}

export function closeOtherTabs(ws: Workspace, tabId: string): Workspace {
  return withLayout(ws, closeOthersIn(ws.layout, tabId));
}

export function pinTab(ws: Workspace, tabId: string, pinned: boolean): Workspace {
  return keepPreview(withLayout(ws, pinIn(ws.layout, tabId, pinned)), tabId);
}

export function reorderTab(ws: Workspace, tabId: string, toIndex: number): Workspace {
  return withLayout(ws, reorderIn(ws.layout, tabId, toIndex));
}

export function moveTab(
  ws: Workspace,
  tabId: string,
  target: GroupTarget,
  toIndex?: number,
): Workspace {
  return keepPreview(withLayout(ws, moveTabToGroup(ws.layout, tabId, target, toIndex)), tabId);
}

/// A copy of the tab shown, with its history, in the other group (Split Right or Left).
function copyOf(tab: PageTab, newId: () => string): PageTab {
  return { ...tab, id: newId(), pinned: false };
}

export function splitRight(ws: Workspace, newId: () => string): Workspace {
  const tab = focusedTab(ws);
  return withLayout(ws, splitRightIn(ws.layout, tab.id, copyOf(tab, newId)));
}

export function splitLeft(ws: Workspace, newId: () => string): Workspace {
  const tab = focusedTab(ws);
  return withLayout(ws, splitLeftIn(ws.layout, tab.id, copyOf(tab, newId)));
}

export function toggleZoom(ws: Workspace): Workspace {
  if (ws.layout.groups.length < 2) return ws;
  return { ...ws, zoomed: !ws.zoomed };
}

export function setSplitRatio(ws: Workspace, ratio: number): Workspace {
  return { ...ws, splitRatio: clampSplitRatio(ratio) };
}

/// The groups the page area shows at `width`: both while each keeps the desktop's minimum,
/// else the focused one alone (with a switch to the other, 1.5).
export function visibleGroups(ws: Workspace, width: number): PageGroup[] {
  const { groups } = ws.layout;
  if (groups.length < 2 || ws.zoomed || width < SPLIT_MIN_GROUP * 2) {
    return [focusedGroup(ws.layout)];
  }
  return groups;
}

const tabSchema = z.object({
  id: z.string(),
  view: z.string(),
  backStack: z.array(z.string()),
  forwardStack: z.array(z.string()),
  pinned: z.boolean(),
});
const groupSchema = z.object({
  id: z.string(),
  tabs: z.array(tabSchema).min(1),
  activeTabId: z.string(),
});
const workspaceSchema = z.object({
  layout: z.object({ groups: z.array(groupSchema).min(1).max(2), focusedGroupId: z.string() }),
  preview: z.record(z.string(), z.string()),
  splitRatio: z.number(),
  zoomed: z.boolean(),
});
/// The first tablet version's tabs (`nookly.shell.tabs`).
const oldTabsSchema = z.object({
  tabs: z.array(z.object({ id: z.string(), path: z.string() })).min(1),
  active: z.string(),
});

function readJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/// What was saved, the first tablet version's tabs when nothing was, or a fresh workspace.
export function parseWorkspace(
  saved: string | null,
  newId: () => string,
  oldTabs: string | null = null,
): Workspace {
  const parsed = workspaceSchema.safeParse(readJson(saved));
  if (parsed.success) {
    const { layout } = parsed.data;
    const sound =
      layout.groups.some((g) => g.id === layout.focusedGroupId) &&
      layout.groups.every((g) => g.tabs.some((t) => t.id === g.activeTabId));
    if (sound) return { ...parsed.data, zoomed: false };
  }
  const old = oldTabsSchema.safeParse(readJson(oldTabs));
  if (old.success) {
    const tabs = old.data.tabs.map((t) => ({ ...makePageTab(t.path, newId), id: t.id }));
    const active = tabs.some((t) => t.id === old.data.active) ? old.data.active : tabs[0].id;
    const group: PageGroup = { id: newId(), tabs, activeTabId: active };
    return { ...newWorkspace(newId), layout: { groups: [group], focusedGroupId: group.id } };
  }
  return newWorkspace(newId);
}
