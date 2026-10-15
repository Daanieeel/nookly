import { type Tab, moveTab, pinnedFirst, tabAfterClose } from "./tab-model.ts";

/// Side by side tab groups, like a code editor's split view. Pure: the store in
/// `nav.ts` materializes the groups, runs one of these and shows the result.

/// A group of tabs with its own active one. At most two exist, left then right.
export interface TabGroup {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

/// Every group, in order, and the one shortcuts, the sidebar and new tabs act on.
export interface TabLayout {
  groups: TabGroup[];
  focusedGroupId: string;
}

export const MAX_GROUPS = 2;

export function makeGroup(tabs: Tab[], activeTabId = tabs[0].id): TabGroup {
  return { id: crypto.randomUUID(), tabs, activeTabId };
}

export function focusedGroup(layout: TabLayout): TabGroup {
  return layout.groups.find((g) => g.id === layout.focusedGroupId) ?? layout.groups[0];
}

export function groupOfTab(layout: TabLayout, tabId: string): TabGroup | undefined {
  return layout.groups.find((g) => g.tabs.some((t) => t.id === tabId));
}

export function findTab(layout: TabLayout, tabId: string): Tab | undefined {
  return groupOfTab(layout, tabId)?.tabs.find((t) => t.id === tabId);
}

export function activeTab(group: TabGroup): Tab {
  return group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0];
}

function replaceGroup(layout: TabLayout, group: TabGroup): TabLayout {
  return { ...layout, groups: layout.groups.map((g) => (g.id === group.id ? group : g)) };
}

/// Drops groups left without tabs. Focus moves to a neighbour when its group goes.
function pruneEmpty(layout: TabLayout): TabLayout {
  const groups = layout.groups.filter((g) => g.tabs.length > 0);
  if (groups.length === layout.groups.length) return layout;
  const focusedGroupId = groups.some((g) => g.id === layout.focusedGroupId)
    ? layout.focusedGroupId
    : groups[0].id;
  return { groups, focusedGroupId };
}

export function focusGroup(layout: TabLayout, groupId: string): TabLayout {
  if (groupId === layout.focusedGroupId || !layout.groups.some((g) => g.id === groupId)) {
    return layout;
  }
  return { ...layout, focusedGroupId: groupId };
}

/// Shows `tabId` in its group and focuses that group.
export function activateTab(layout: TabLayout, tabId: string): TabLayout {
  const group = groupOfTab(layout, tabId);
  if (!group) return layout;
  return { ...replaceGroup(layout, { ...group, activeTabId: tabId }), focusedGroupId: group.id };
}

/// Adds `tab` to the focused group, at the end.
export function addTab(layout: TabLayout, tab: Tab, activate: boolean): TabLayout {
  const group = focusedGroup(layout);
  return replaceGroup(layout, {
    ...group,
    tabs: [...group.tabs, tab],
    activeTabId: activate ? tab.id : group.activeTabId,
  });
}

/// Steps through the focused group's tabs, wrapping around.
export function cycleTab(layout: TabLayout, step: 1 | -1): TabLayout {
  const group = focusedGroup(layout);
  if (group.tabs.length < 2) return layout;
  const index = group.tabs.findIndex((t) => t.id === group.activeTabId);
  const next = group.tabs[(index + step + group.tabs.length) % group.tabs.length];
  return replaceGroup(layout, { ...group, activeTabId: next.id });
}

/// Closes a tab. The last tab of a group closes the group; the last tab of all
/// leaves `fresh` behind, a Dashboard tab.
export function closeTab(layout: TabLayout, tabId: string, fresh: () => Tab): TabLayout {
  const group = groupOfTab(layout, tabId);
  if (!group) return layout;
  if (group.tabs.length === 1 && layout.groups.length === 1) {
    const tab = fresh();
    return replaceGroup(layout, { ...group, tabs: [tab], activeTabId: tab.id });
  }
  const tabs = group.tabs.filter((t) => t.id !== tabId);
  const activeTabId =
    group.activeTabId === tabId
      ? (tabAfterClose(group.tabs, tabId)?.id ?? tabs[0]?.id ?? "")
      : group.activeTabId;
  return pruneEmpty(replaceGroup(layout, { ...group, tabs, activeTabId }));
}

/// Closes every tab of `tabId`'s group except it and the pinned ones, and shows it.
export function closeOtherTabs(layout: TabLayout, tabId: string): TabLayout {
  const group = groupOfTab(layout, tabId);
  if (!group) return layout;
  const tabs = group.tabs.filter((t) => t.id === tabId || t.pinned);
  return replaceGroup(layout, { ...group, tabs, activeTabId: tabId });
}

export function pinTab(layout: TabLayout, tabId: string, pinned: boolean): TabLayout {
  const group = groupOfTab(layout, tabId);
  if (!group) return layout;
  const tabs = pinnedFirst(group.tabs.map((t) => (t.id === tabId ? { ...t, pinned } : t)));
  return replaceGroup(layout, { ...group, tabs });
}

/// Moves a tab within its own group.
export function reorderTab(layout: TabLayout, tabId: string, toIndex: number): TabLayout {
  const group = groupOfTab(layout, tabId);
  if (!group) return layout;
  return replaceGroup(layout, { ...group, tabs: moveTab(group.tabs, tabId, toIndex) });
}

/// Where a tab can go: an existing group, or a new group on the right.
export type GroupTarget = { groupId: string } | "new-right";

/// Moves a tab into another group (or a new one on the right), at `toIndex` or the
/// end, then shows and focuses it. A group left empty closes. Moving the only tab
/// there is into a new group would change nothing, so it is ignored.
export function moveTabToGroup(
  layout: TabLayout,
  tabId: string,
  target: GroupTarget,
  toIndex?: number,
): TabLayout {
  const source = groupOfTab(layout, tabId);
  if (!source) return layout;
  const tab = source.tabs.find((t) => t.id === tabId);
  if (!tab) return layout;
  if (target === "new-right") {
    if (layout.groups.length >= MAX_GROUPS) {
      const right = layout.groups[layout.groups.length - 1];
      if (right.id === source.id) return layout;
      return moveTabToGroup(layout, tabId, { groupId: right.id }, toIndex);
    }
    if (source.tabs.length === 1) return layout;
    const remaining = source.tabs.filter((t) => t.id !== tabId);
    const sourceActive =
      source.activeTabId === tabId
        ? (tabAfterClose(source.tabs, tabId)?.id ?? remaining[0].id)
        : source.activeTabId;
    const created = makeGroup([tab]);
    return {
      groups: [
        ...replaceGroup(layout, { ...source, tabs: remaining, activeTabId: sourceActive }).groups,
        created,
      ],
      focusedGroupId: created.id,
    };
  }
  if (target.groupId === source.id) {
    return activateTab(reorderTab(layout, tabId, toIndex ?? source.tabs.length), tabId);
  }
  const destination = layout.groups.find((g) => g.id === target.groupId);
  if (!destination) return layout;
  const remaining = source.tabs.filter((t) => t.id !== tabId);
  const sourceActive =
    source.activeTabId === tabId
      ? (tabAfterClose(source.tabs, tabId)?.id ?? remaining[0]?.id ?? "")
      : source.activeTabId;
  const inserted = [...destination.tabs];
  inserted.splice(Math.max(0, Math.min(toIndex ?? inserted.length, inserted.length)), 0, tab);
  const moved = replaceGroup(
    replaceGroup(layout, { ...source, tabs: remaining, activeTabId: sourceActive }),
    { ...destination, tabs: pinnedFirst(inserted), activeTabId: tabId },
  );
  return pruneEmpty({ ...moved, focusedGroupId: destination.id });
}

/// Opens `copy` (a copy of a tab, with a new id) in the group on the right of
/// `tabId`'s group, creating it when there is none, and focuses it. A tab already in
/// the rightmost of two groups has nowhere to go.
export function splitRight(layout: TabLayout, tabId: string, copy: Tab): TabLayout {
  const source = groupOfTab(layout, tabId);
  if (!source) return layout;
  const index = layout.groups.findIndex((g) => g.id === source.id);
  const right = layout.groups[index + 1];
  if (right) {
    return {
      ...replaceGroup(layout, { ...right, tabs: [...right.tabs, copy], activeTabId: copy.id }),
      focusedGroupId: right.id,
    };
  }
  if (layout.groups.length >= MAX_GROUPS) return layout;
  const created = makeGroup([copy]);
  return { groups: [...layout.groups, created], focusedGroupId: created.id };
}

/// Whether Split Right has somewhere to put `tabId`.
export function canSplitRight(layout: TabLayout, tabId: string): boolean {
  const source = groupOfTab(layout, tabId);
  if (!source) return false;
  return layout.groups.length < MAX_GROUPS || layout.groups.at(-1)?.id !== source.id;
}

/// Opens `copy` (a copy of a tab, with a new id) in the group on the left of
/// `tabId`'s group, creating it when there is none, and focuses it. A tab already in
/// the leftmost of two groups has nowhere to go.
export function splitLeft(layout: TabLayout, tabId: string, copy: Tab): TabLayout {
  const source = groupOfTab(layout, tabId);
  if (!source) return layout;
  const index = layout.groups.findIndex((g) => g.id === source.id);
  const left = layout.groups[index - 1];
  if (left) {
    return {
      ...replaceGroup(layout, { ...left, tabs: [...left.tabs, copy], activeTabId: copy.id }),
      focusedGroupId: left.id,
    };
  }
  if (layout.groups.length >= MAX_GROUPS) return layout;
  const created = makeGroup([copy]);
  return { groups: [created, ...layout.groups], focusedGroupId: created.id };
}

/// Whether Split Left has somewhere to put `tabId`.
export function canSplitLeft(layout: TabLayout, tabId: string): boolean {
  const source = groupOfTab(layout, tabId);
  if (!source) return false;
  return layout.groups.length < MAX_GROUPS || layout.groups[0].id !== source.id;
}

/// Replaces a tab, wherever it is, with `update(tab)`.
export function updateTab(layout: TabLayout, tabId: string, update: (tab: Tab) => Tab): TabLayout {
  const group = groupOfTab(layout, tabId);
  if (!group) return layout;
  return replaceGroup(layout, {
    ...group,
    tabs: group.tabs.map((t) => (t.id === tabId ? update(t) : t)),
  });
}

/// The split ratio is the left group's share of the width.
export const DEFAULT_SPLIT_RATIO = 0.5;
export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}
