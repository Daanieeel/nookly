import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sidebar } from "../screens/Sidebar.tsx";
import {
  SIDEBAR_WIDTH,
  SPLIT_MIN_GROUP,
  SidebarBesideProvider,
  useWindowClass,
  useWindowSize,
} from "../ui/pane.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { useFollowRouter } from "./follow-router.ts";
import { useSidebarCollapsed } from "./layout-prefs.ts";
import { PageGroupView } from "./PageGroup.tsx";
import { ShortcutHost } from "./ShortcutHost.tsx";
import { SplitProvider } from "./split-context.ts";
import { TabStrip } from "./TabStrip.tsx";
import { Titlebar } from "./Titlebar.tsx";
import { useShellActions } from "./actions.ts";
import { matchPage, pathOf } from "./pages.tsx";
import { type Workspace, activePath, focusedTab, visibleGroups } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

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
  const page = matchPage(pathOf(route.name, (route.params ?? {}) as Record<string, unknown>));
  return page ? <View pointerEvents="none" /> : <>{children}</>;
}

/// Where an item picked from the router goes: beside the list it was picked from when the
/// window keeps room for both (list beside item, 1.6), else in the tab shown.
export function whereToOpen(ws: Workspace, path: string, pageArea: number) {
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
  const [collapsed] = useSidebarCollapsed();
  const [overlay, setOverlay] = useState(false);
  const beside = windowClass === "expanded" && !collapsed;
  const ws = useWorkspace((s) => s.ws);
  const pageArea = width - GAP * 2 - (beside ? SIDEBAR_WIDTH + GAP : 0);
  // A medium window shows one group at a time, the desktop's rule for a narrow window.
  const splitRoom = windowClass === "expanded" ? pageArea : 0;
  const groups = visibleGroups(ws, splitRoom);
  const split = groups.length > 1;
  const onAction = useShellActions(
    windowClass === "medium" ? () => setOverlay((open) => !open) : undefined,
  );
  useFollowRouter({
    opened: (path) => {
      setOverlay(false);
      workspace.open(path, whereToOpen(useWorkspace.getState().ws, path, splitRoom));
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
  return (
    <SidebarBesideProvider value={beside}>
      <SplitProvider value={{ show: (path) => workspace.open(path, "right") }}>
        {/* The router's stack, behind the window: pages draw nothing in it on a tablet,
            and what it presents (sheets, signing in, a study session) goes over everything. */}
        <View style={StyleSheet.absoluteFill}>{stack}</View>
        <View className="flex-1 bg-background">
          <Titlebar
            onAction={onAction}
            sidebarCollapsed={windowClass === "medium" ? !overlay : collapsed}
            top={insets.top}
          />
          {showTabBar && focusedGroup ? <TabStrip groupId={focusedGroup.id} /> : null}
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
                <Sidebar close={() => {}} />
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
                  />
                </View>
              ))}
            </View>
          </View>
          {windowClass === "medium" && overlay ? (
            <View className="absolute inset-0 flex-row" style={{ top: insets.top + 52 }}>
              <View
                className="border-r border-border bg-background shadow-md"
                style={{ width: SIDEBAR_WIDTH }}
              >
                <Sidebar close={() => setOverlay(false)} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Sidebar"
                className="flex-1 bg-black/20"
                onPress={() => setOverlay(false)}
              />
            </View>
          ) : null}
        </View>
        <ShortcutHost onAction={onAction} />
        <CommandPalette onAction={onAction} />
      </SplitProvider>
    </SidebarBesideProvider>
  );
}
