import { usePathname } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sidebar } from "../screens/Sidebar.tsx";
import { SIDEBAR_WIDTH, SidebarBesideProvider } from "../ui/pane.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ShortcutHost } from "./ShortcutHost.tsx";
import { Titlebar } from "./Titlebar.tsx";
import { useShellActions } from "./actions.ts";
import { history } from "./history.ts";
import { useSidebarCollapsed } from "./layout-prefs.ts";

/// The iPad's window, laid out like the desktop's: the sidebar on the left, a titlebar
/// over the page, and the palette and keyboard shortcuts over everything. `children` is
/// the page stack.
export function TabletShell({ children }: { children: ReactNode }) {
  const [collapsed] = useSidebarCollapsed();
  const insets = useSafeAreaInsets();
  const onAction = useShellActions();
  // The titlebar's back and forward read the history as it is for this page.
  history.visit(usePathname());
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
          <View className="flex-1">{children}</View>
        </View>
      </View>
      <ShortcutHost onAction={onAction} />
      <CommandPalette onAction={onAction} />
    </SidebarBesideProvider>
  );
}
