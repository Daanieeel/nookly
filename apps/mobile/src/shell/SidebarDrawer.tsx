import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { Sidebar } from "../screens/Sidebar.tsx";
import { PageEdge, insetPageStyle } from "../ui/inset-page.tsx";
import { useTheme } from "../ui/theme.ts";

/// Lets a screen's menu button open the sidebar.
const SidebarHandle = createContext<{ open(): void; close(): void } | null>(null);
export const useSidebarDrawer = () => useContext(SidebarHandle);

/// How much of the screen's left edge stays with the system's swipe back, on a page you
/// can go back from.
export const BACK_EDGE = 24;

/// Like Claude's: the sidebar waits behind the whole app, and the page, whatever it is and
/// with its own bar, slides aside to show it, its corners rounded. A swipe to the right
/// anywhere opens it, except at the very edge of a page you can go back from, where the
/// system takes it as "back". Swiping the other way is left to the page (its details).
export function SidebarDrawer({
  enabled,
  edgeBack,
  children,
}: {
  /// Off over sign in and the welcome screen.
  enabled: boolean;
  /// Whether the current page has a page to go back to.
  edgeBack: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const handle = useMemo(() => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);
  const drawerWidth = Math.min(width * 0.82, 340);
  const inset = edgeBack ? BACK_EDGE : 0;
  // Closed, only a drag to the right is the drawer's; the page's own drawer on the right
  // takes the drag to the left.
  const configure = useCallback(
    (
      gesture: Parameters<
        NonNullable<React.ComponentProps<typeof Drawer>["configureGestureHandler"]>
      >[0],
    ) =>
      (open ? gesture : gesture.activeOffsetX([5, 10_000])).hitSlop({
        left: open ? 0 : inset,
        width: open ? undefined : width - inset,
      }),
    [open, inset, width],
  );
  return (
    <Drawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      drawerType="back"
      swipeEnabled={enabled}
      swipeEdgeWidth={width}
      configureGestureHandler={configure}
      overlayStyle={{ backgroundColor: "transparent" }}
      drawerStyle={{ width: drawerWidth, backgroundColor: theme.colors.background }}
      renderDrawerContent={() => (
        <>
          <Sidebar close={handle.close} />
          <PageEdge drawerWidth={drawerWidth} dark={theme.dark} />
        </>
      )}
    >
      <SidebarHandle.Provider value={handle}>
        <View className="flex-1" style={insetPageStyle(theme.colors.page)}>
          {children}
        </View>
      </SidebarHandle.Provider>
    </Drawer>
  );
}
