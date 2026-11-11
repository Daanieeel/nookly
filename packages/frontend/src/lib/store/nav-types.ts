import type { ViewModule } from "#/lib/api/views.ts";
import type { ModuleKey } from "@nookly/shared/modules";
import type { Tab } from "./tab-model.ts";
import type { GroupTarget, TabGroup } from "./tab-groups.ts";

export { MODULE_KEYS, type ModuleKey } from "@nookly/shared/modules";

export type View =
  | { kind: "dashboard" }
  | { kind: "pinned" }
  | { kind: "calendar" }
  | { kind: "tasks"; viewId?: string }
  | { kind: "assignments"; viewId?: string }
  | { kind: "trash" }
  | {
      kind: "module";
      spaceId: string;
      module: ModuleKey;
      filterCourseId?: string;
      viewId?: string;
      /// Where the Moodle module is, see `features/moodle/moodle-path.ts`.
      moodlePath?: string;
    }
  | { kind: "entity"; entityId: string; spaceId: string };

/// A stable name for a view, for anything that remembers something per view (where it was
/// scrolled). The same page gives the same key, whichever Space it is opened from.
export function viewKey(view: View): string {
  switch (view.kind) {
    case "tasks":
    case "assignments":
      return `${view.kind}:${view.viewId ?? ""}`;
    case "module":
      return `module:${view.spaceId}:${view.module}:${view.viewId ?? ""}:${view.filterCourseId ?? ""}:${view.moodlePath ?? ""}`;
    case "entity":
      return `entity:${view.entityId}`;
    default:
      return view.kind;
  }
}

export interface RecentEntry {
  entityId: string;
  spaceId: string;
  openedAt: number;
}

/// Where to land once an entity's view has loaded: a block of a page to scroll into view
/// (a block level search result, consumed by `BlockEditor`), or a page of a file (a mention
/// like `[Slides (p. 12)]`, consumed by the PDF viewer).
export interface FocusBlock {
  entityId: string;
  blockId?: string;
  page?: number;
  /// A row (from 1) or column (from 1) of the table `blockId` is, to mark once it is shown.
  row?: number;
  column?: number;
  /// Text of the block `blockId` to select once it is shown.
  quote?: string;
}

export interface NavState {
  view: View;
  /// The focused group's tabs. The active one's `view` and history live in `view`,
  /// `backStack` and `forwardStack` below, so read tabs through `currentTabs`.
  tabs: Tab[];
  activeTabId: string;
  /// Every tab group, left then right. The focused one's entry is only brought up to
  /// date when focus leaves it, so read groups through `tabGroups`.
  groups: TabGroup[];
  /// The group the sidebar, new tabs and tab shortcuts act on.
  focusedGroupId: string;
  focusGroup: (groupId: string) => void;
  /// Focuses the left (0) or right (1) group, when it exists.
  focusGroupAt: (index: number) => void;
  /// Opens a copy of a tab (the active one by default) in the group on the right.
  splitRight: (tabId?: string) => void;
  /// Opens a copy of a tab (the active one by default) in the group on the left.
  splitLeft: (tabId?: string) => void;
  /// Moves a tab into another group, or a new one on the right, at `toIndex`.
  moveTabToGroup: (tabId: string, target: GroupTarget, toIndex?: number) => void;
  /// Whether the focused group fills the page with the other hidden. Kept only while
  /// there are two groups, and not saved.
  groupZoomed: boolean;
  /// Zooms the focused group, or shows both groups again.
  toggleGroupZoom: () => void;
  /// The left group's share of the width while split.
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  /// Opens a view in a new tab. Pass `activate: false` to leave it in the background.
  openInNewTab: (view?: View, options?: { activate?: boolean }) => void;
  switchTab: (id: string) => void;
  /// Steps to the next (1) or previous (-1) tab of the focused group, wrapping around.
  cycleTab: (step: 1 | -1) => void;
  closeTab: (id: string) => void;
  /// Closes every tab of the focused group except the active one and the pinned ones.
  closeOtherTabs: () => void;
  pinTab: (id: string, pinned: boolean) => void;
  reorderTab: (id: string, toIndex: number) => void;
  /// The tab being dragged in the tab bar.
  draggingTabId: string | null;
  setDraggingTabId: (id: string | null) => void;
  /// The Space the sidebar shows. It follows the focused tab, and is set directly when
  /// the user picks another Space in the sidebar.
  activeSpaceId: string | null;
  paletteOpen: boolean;
  switcherOpen: boolean;
  commandsOpen: boolean;
  settingsOpen: boolean;
  /// The Settings page to show when Settings opens next (a category id), once.
  settingsPage: string | null;
  importOpen: boolean;
  whatsNewOpen: boolean;
  /// The open What's new dialog lists every version, not just what changed since the last one seen.
  whatsNewHistory: boolean;
  quickJotOpen: boolean;
  /// The open Quick assignment dialog, which starts in the course of the session running now.
  newAssignmentOpen: boolean;
  /// The open New task dialog: the Space it creates in and the title it starts with.
  newTask: { spaceId: string; title: string } | null;
  /// The session the open Quick Jot writes into; null for a plain Jot.
  focusBlock: FocusBlock | null;
  /// The group `focusBlock` was opened in, so the same page open in the other group
  /// doesn't scroll as well.
  focusBlockGroupId: string | null;
  sidebarCollapsed: boolean;
  /// Whether the details sidebar starts collapsed, remembered across launches.
  rightSidebarCollapsed: boolean;
  /// Each tab group's own collapsed state once it was toggled there, by group id, so
  /// the two groups of a split collapse their details sidebars independently. Read
  /// through `rightSidebarCollapsedIn`.
  rightSidebarCollapsedByGroup: Record<string, boolean>;
  rightSidebarWidth: number;
  recents: RecentEntry[];
  /// Views to return to with Back, oldest first, and to redo with Forward, most
  /// recent last. Session only; a restart starts with empty history.
  backStack: View[];
  forwardStack: View[];
  setView: (view: View) => void;
  goBack: () => void;
  goForward: () => void;
  /// `focus` scrolls to a block once its page renders; its `entityId` is the
  /// page holding the block, which may be embedded in the opened entity.
  openEntity: (entityId: string, spaceId: string, focus?: FocusBlock) => void;
  /// The Bookmark shown in the details sheet, over whatever view is open.
  bookmarkSheetId: string | null;
  /// Bookmarks have no page of their own: an entity view opened for one steps
  /// back to where it came from (or the Bookmarks page) and opens the sheet.
  /// `groupId` names the group showing it, when that is not the focused one.
  showBookmark: (entityId: string, spaceId: string, groupId?: string) => void;
  setBookmarkSheetId: (entityId: string | null) => void;
  /// Saved Views have no page of their own: an entity view opened for one becomes
  /// its module page with the View applied, replacing the entity view in history.
  showSavedView: (entityId: string, spaceId: string, module: ViewModule, groupId?: string) => void;
  setActiveSpace: (spaceId: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  setCommandsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  /// Opens Settings on one page, like Account from the sync status.
  openSettingsAt: (page: string) => void;
  clearSettingsPage: () => void;
  setImportOpen: (open: boolean) => void;
  setWhatsNewOpen: (open: boolean, history?: boolean) => void;
  setQuickJotOpen: (open: boolean) => void;
  setNewAssignmentOpen: (open: boolean) => void;
  setNewTask: (draft: { spaceId: string; title: string } | null) => void;
  clearFocusBlock: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /// Collapses the details sidebar of one group, the focused one by default.
  setRightSidebarCollapsed: (collapsed: boolean, groupId?: string) => void;
  setRightSidebarWidth: (width: number) => void;
}
