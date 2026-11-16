import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SIDEBAR_WIDTH,
  SPLIT_MIN_GROUP,
  SidebarBesideProvider,
  useWindowClass,
  useWindowSize,
} from "../ui/pane.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ToastHost } from "../ui/ToastHost.tsx";
import { noteTouch } from "../ui/sheet/touch-point.ts";
import { useFollowRouter } from "./follow-router.ts";
import { useOpenBeside, useSidebarCollapsed, useSidebarPinned } from "./layout-prefs.ts";
import { SidebarOverlay } from "./sidebar/SidebarOverlay.tsx";
import { TabletSidebar } from "./sidebar/TabletSidebar.tsx";
import { PageGroupView } from "./PageGroup.tsx";
import { ShortcutHost } from "./ShortcutHost.tsx";
import { SplitProvider } from "./split-context.ts";
import { TabStrip } from "./TabStrip.tsx";
import { TITLEBAR_HEIGHT, Titlebar } from "./Titlebar.tsx";
import { SplitDivider } from "./SplitDivider.tsx";
import { useWindowControlsInset } from "./window-controls.ts";
import { useShellActions } from "./actions.ts";
import { matchPage, parseRouteParams, pathOf } from "./pages.tsx";
import { type Workspace, activePath, focusedTab, visibleGroups } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

/// The titlebar's height under the status bar.

/// The room between the sidebar, the page cards and the window's edges, the desktop's.
const GAP = 12;

/// On a tablet a page route's screen is empty: the shell draws the page in a tab.
export function tabletScreen({
  route,
  children,
}: {
  route: { name: string; params?: object };
  children: ReactNode;
}) {
  const page = matchPage(pathOf(route.name, parseRouteParams(route.params)));
  return page ? <View pointerEvents="none" /> : <>{children}</>;
}

/// Where an item picked from the router goes: beside the list it was picked from when the
/// window keeps room for both (list beside item, 1.6), else in the tab shown.
export function whereToOpen(ws: Workspace, path: string, pageArea: number, beside = true) {
  if (!beside) return "here" as const;
  const opened = matchPage(path);
  const from = matchPage(activePath(ws));
  if (opened?.kind === "item" && from?.kind === "list" && pageArea >= SPLIT_MIN_GROUP * 2) {
    return "beside" as const;
  }
  return "here" as const;
}

/// The iPad's window, laid out as the desktop's (D83): the titlebar across the top, the
/// sidebar beside the pages (over them in a medium window), and up to two groups of tabs
/// side by side. Pages are drawn here, per tab; the router's own stack only shows what
/// goes over the window (create forms, pickers, a study session), so `stack` sits behind.
export function TabletShell({ stack }: { stack: ReactNode }) {
  const windowClass = useWindowClass();
  const { width } = useWindowSize();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [pinned, setPinned] = useSidebarPinned();
  const [overlay, setOverlay] = useState(false);
  // Beside the page in an expanded window, as on the desktop; over it in a medium one,
  // unless pinned there from 900 wide.
  const canPin = windowClass === "medium" && width >= 900;
  const beside = !collapsed && (windowClass === "expanded" || (canPin && pinned));
  const ws = useWorkspace((s) => s.ws);
  const [openBeside] = useOpenBeside();
  const pageArea = width - GAP * 2 - (beside ? SIDEBAR_WIDTH + GAP : 0);
  // A medium window shows one group at a time, the desktop's rule for a narrow window.
  const splitRoom = windowClass === "expanded" ? pageArea : 0;
  const groups = visibleGroups(ws, splitRoom);
  const split = groups.length > 1;
  const overlaid = windowClass === "medium" && !beside;
  const onAction = useShellActions(overlaid ? () => setOverlay((open) => !open) : undefined);
  useFollowRouter({
    opened: (path) => {
      setOverlay(false);
      workspace.open(path, whereToOpen(useWorkspace.getState().ws, path, splitRoom, openBeside));
    },
    returned: (path) => {
      const tab = focusedTab(useWorkspace.getState().ws);
      if (tab.backStack.at(-1) === path) workspace.back();
      else workspace.open(path, "here");
    },
  });
  // Folding into a medium window closes the sidebar laid over the page.
  useEffect(() => {
    if (windowClass !== "medium") setOverlay(false);
  }, [windowClass]);
  const twoGroups = ws.layout.groups.length > 1;
  const focusedGroup = ws.layout.groups.find((g) => g.id === ws.layout.focusedGroupId);
  const showTabBar = !split && ((focusedGroup?.tabs.length ?? 0) > 1 || twoGroups);
  const ratio = ws.splitRatio;
  const controls = useWindowControlsInset();
  return (
    <SidebarBesideProvider value={beside}>
      <SplitProvider
        value={{
          show: (path) => workspace.open(path, "right"),
          newTab: (path) => workspace.open(path, "newTab"),
        }}
      >
        {/* Every touch is noted, so a menu or picker it opens floats there (D83, 2.3). */}
        <View className="flex-1" onTouchStart={noteTouch}>
          {/* The router's stack, behind the window: pages draw nothing in it on a tablet,
            and what it presents (sheets, signing in, a study session) goes over everything. */}
          <View style={StyleSheet.absoluteFill}>{stack}</View>
          <View className="flex-1 bg-background">
            <Titlebar
              onAction={onAction}
              sidebarCollapsed={overlaid ? !overlay : collapsed}
              top={insets.top}
              compact={windowClass === "medium"}
              // The window controls sit over the titlebar's start while the window shows them.
              leading={controls.top < TITLEBAR_HEIGHT + insets.top ? controls.left : 0}
            />
            {showTabBar && focusedGroup ? <TabStrip groupId={focusedGroup.id} alone /> : null}
            <View
              className="min-h-0 flex-1 flex-row"
              style={{
                gap: GAP,
                paddingHorizontal: beside ? GAP : 0,
                paddingBottom: beside ? Math.max(GAP, insets.bottom) : 0,
              }}
            >
              {beside ? (
                <View style={{ width: SIDEBAR_WIDTH }}>
                  <TabletSidebar
                    width={SIDEBAR_WIDTH}
                    pinned={canPin ? pinned : undefined}
                    onPin={canPin ? () => setPinned(false) : undefined}
                  />
                </View>
              ) : null}
              <View className="min-w-0 flex-1 flex-row" style={{ gap: split ? GAP : 0 }}>
                {groups.map((group, index) => (
                  <View
                    key={group.id}
                    className="min-w-0"
                    style={{ flex: split ? (index === 0 ? ratio : 1 - ratio) : 1 }}
                  >
                    <PageGroupView
                      group={group}
                      focused={group.id === ws.layout.focusedGroupId}
                      width={
                        split ? pageArea * (index === 0 ? ratio : 1 - ratio) - GAP / 2 : pageArea
                      }
                      tabs={split}
                      card={beside}
                      onEdge={overlaid ? () => setOverlay(true) : undefined}
                    />
                  </View>
                ))}
                {split ? <SplitDivider left={pageArea * ratio} area={pageArea} /> : null}
              </View>
            </View>
            {overlaid ? (
              <SidebarOverlay
                open={overlay}
                onOpenChange={setOverlay}
                width={SIDEBAR_WIDTH}
                top={insets.top + TITLEBAR_HEIGHT}
              >
                <TabletSidebar
                  width={SIDEBAR_WIDTH}
                  onPicked={() => setOverlay(false)}
                  pinned={canPin ? false : undefined}
                  onPin={
                    canPin
                      ? () => {
                          setPinned(true);
                          setCollapsed(false);
                          setOverlay(false);
                        }
                      : undefined
                  }
                />
              </SidebarOverlay>
            ) : null}
          </View>
          <ShortcutHost onAction={onAction} />
          <ToastHost />
          <CommandPalette onAction={onAction} />
        </View>
      </SplitProvider>
    </SidebarBesideProvider>
  );
}
