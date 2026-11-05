import { z } from "zod";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import { type Tab, makeTab } from "./tab-model.ts";
import {
  type TabLayout,
  MAX_GROUPS,
  activeTab,
  clampSplitRatio,
  DEFAULT_SPLIT_RATIO,
  focusedGroup,
  makeGroup,
} from "./tab-groups.ts";
import {
  readStoredActiveSpace,
  readStoredCollapsed,
  readStoredRecents,
  readStoredRightSidebarCollapsed,
  readStoredRightSidebarWidth,
} from "./nav-storage.ts";
import { MODULE_KEYS, type NavState, type View } from "./nav-types.ts";
import type { NavActions } from "./nav-actions.ts";

const viewSchema: z.ZodType<View> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dashboard") }),
  z.object({ kind: z.literal("pinned") }),
  z.object({ kind: z.literal("calendar") }),
  z.object({ kind: z.literal("tasks"), viewId: z.string().optional() }),
  z.object({ kind: z.literal("assignments"), viewId: z.string().optional() }),
  z.object({ kind: z.literal("trash") }),
  z.object({
    kind: z.literal("module"),
    spaceId: z.string(),
    module: z.enum(MODULE_KEYS),
    filterCourseId: z.string().optional(),
    viewId: z.string().optional(),
    moodlePath: z.string().optional(),
  }),
  z.object({
    kind: z.literal("entity"),
    entityId: z.string(),
    spaceId: z.string(),
  }),
]);

/// Every tab is listed flat in `tabs`, which is all a release from before split view
/// reads. `groups` then says which tab sits in which group; an older release drops it
/// when it saves, so its tabs load back into a single group.
const storedTabsSchema = z.object({
  activeTabId: z.string(),
  tabs: z
    .array(
      z.object({
        id: z.string(),
        view: viewSchema,
        backStack: z.array(viewSchema),
        forwardStack: z.array(viewSchema),
        pinned: z.boolean(),
      }),
    )
    .min(1),
  focusedGroupId: z.string().optional(),
  groups: z
    .array(
      z.object({
        id: z.string(),
        tabIds: z.array(z.string()),
        activeTabId: z.string(),
      }),
    )
    .optional(),
});

function singleLayout(tabs: Tab[], activeTabId: string): TabLayout {
  const group = makeGroup(tabs, activeTabId);
  return { groups: [group], focusedGroupId: group.id };
}

/// Splits the saved flat tab list back into its groups. A tab no group lists (opened
/// in an older release) joins the focused group, so nothing is lost, and the group
/// holding the saved active tab is the focused one.
function layoutFromStored(stored: z.infer<typeof storedTabsSchema>): TabLayout {
  if (!stored.groups?.length) return singleLayout(stored.tabs, stored.activeTabId);
  const byId = new Map(stored.tabs.map((tab) => [tab.id, tab]));
  const placed = new Set<string>();
  const groups = stored.groups.slice(0, MAX_GROUPS).map((group) => {
    const tabs: Tab[] = [];
    for (const id of group.tabIds) {
      const tab = byId.get(id);
      if (tab && !placed.has(id)) {
        placed.add(id);
        tabs.push(tab);
      }
    }
    return { id: group.id, tabs, activeTabId: group.activeTabId };
  });
  const leftovers = stored.tabs.filter((tab) => !placed.has(tab.id));
  const home = groups.find((g) => g.id === stored.focusedGroupId) ?? groups[0];
  home.tabs.push(...leftovers);
  const kept = groups
    .filter((g) => g.tabs.length > 0)
    .map((g) =>
      g.tabs.some((t) => t.id === g.activeTabId) ? g : { ...g, activeTabId: g.tabs[0].id },
    );
  const focused = kept.find((g) => g.tabs.some((t) => t.id === stored.activeTabId)) ?? kept[0];
  return {
    groups: kept.map((g) => (g === focused ? { ...g, activeTabId: stored.activeTabId } : g)),
    focusedGroupId: focused.id,
  };
}

function readStoredTabs(): TabLayout {
  try {
    const raw = preferences.get(STORAGE_KEYS.tabs);
    if (raw) {
      const parsed = storedTabsSchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.tabs.some((t) => t.id === parsed.data.activeTabId)) {
        return layoutFromStored(parsed.data);
      }
    }
  } catch {
    // fall through to a single fresh tab
  }
  const tab = makeTab({ kind: "dashboard" });
  return singleLayout([tab], tab.id);
}

function readStoredSplitRatio(): number {
  const raw = preferences.get(STORAGE_KEYS.splitRatio);
  return raw === null ? DEFAULT_SPLIT_RATIO : clampSplitRatio(Number(raw));
}

const initialLayout = readStoredTabs();
const initialGroup = focusedGroup(initialLayout);
const initialTab = activeTab(initialGroup);

export type NavData = Omit<NavState, keyof NavActions>;

export const initialNavState: NavData = {
  view: initialTab.view,
  tabs: initialGroup.tabs,
  activeTabId: initialTab.id,
  activeSpaceId: readStoredActiveSpace(),
  paletteOpen: false,
  switcherOpen: false,
  commandsOpen: false,
  settingsOpen: false,
  importOpen: false,
  whatsNewOpen: false,
  whatsNewHistory: false,
  quickJotOpen: false,
  newAssignmentOpen: false,
  newTask: null,
  focusBlock: null,
  focusBlockGroupId: null,
  sidebarCollapsed: readStoredCollapsed(),
  rightSidebarCollapsed: readStoredRightSidebarCollapsed(),
  rightSidebarCollapsedByGroup: {},
  rightSidebarWidth: readStoredRightSidebarWidth(),
  recents: readStoredRecents(),
  backStack: initialTab.backStack,
  forwardStack: initialTab.forwardStack,
  groups: initialLayout.groups,
  focusedGroupId: initialLayout.focusedGroupId,
  groupZoomed: false,
  splitRatio: readStoredSplitRatio(),
  draggingTabId: null,
  bookmarkSheetId: null,
};
