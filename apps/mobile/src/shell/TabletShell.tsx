import { usePathname } from "expo-router";
import { useWindowDimensions } from "react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sidebar } from "../screens/Sidebar.tsx";
import {
  INSPECTOR_MIN_PANE,
  InspectorShownProvider,
  SIDEBAR_WIDTH,
  SidebarBesideProvider,
} from "../ui/pane.tsx";
import { Inspector } from "./inspector.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ShortcutHost } from "./ShortcutHost.tsx";
import { Titlebar } from "./Titlebar.tsx";
import { useShellActions } from "./actions.ts";
import { history } from "./history.ts";
import { useInspectorCollapsed, useSidebarCollapsed } from "./layout-prefs.ts";

/// The iPad's window, laid out like the desktop's: the sidebar on the left, a titlebar
/// over the page, and the palette and keyboard shortcuts over everything. `children` is
/// the page stack.
export function TabletShell({ children }: { children: ReactNode }) {
  const [collapsed] = useSidebarCollapsed();
  const insets = useSafeAreaInsets();
  const [inspectorCollapsed] = useInspectorCollapsed();
  const { width } = useWindowDimensions();
  const onAction = useShellActions();
  const pathname = usePathname();
  // The titlebar's back and forward read the history as it is for this page.
  history.visit(pathname);
  // Details beside an open item, when the page keeps room to breathe.
  const openId = /^\/entity\/([^/]+)/.exec(pathname)?.[1];
  const pane = width - (collapsed ? 0 : SIDEBAR_WIDTH);
  const inspectorShown = Boolean(openId) && !inspectorCollapsed && pane >= INSPECTOR_MIN_PANE;
  return (
    <SidebarBesideProvider value={!collapsed}>
      <View className="flex-1 flex-row bg-background">
        {collapsed ? null : (
          <View style={{ width: SIDEBAR_WIDTH }}>
            <Sidebar close={() => {}} />
          </View>
        )}
        <View
          className={
            collapsed
              ? "flex-1 overflow-hidden"
              : "flex-1 overflow-hidden rounded-l-2xl border-l border-border"
          }
        >
          <Titlebar onAction={onAction} sidebarCollapsed={collapsed} top={insets.top} />
          <View className="flex-1 flex-row">
            <View className="flex-1">
              <InspectorShownProvider value={inspectorShown}>{children}</InspectorShownProvider>
            </View>
            {inspectorShown && openId ? <Inspector id={openId} /> : null}
          </View>
        </View>
      </View>
      <ShortcutHost onAction={onAction} />
      <CommandPalette onAction={onAction} />
    </SidebarBesideProvider>
  );
}
