import { type ReactNode, createContext, useCallback, useContext, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { Sidebar } from "../screens/Sidebar.tsx";
import { PageEdge, insetPageStyle } from "../ui/inset-page.tsx";
import { useTheme } from "../ui/theme.ts";
import { DetailsDrawer } from "./DetailsDrawer.tsx";
import { NEVER, PanesProvider, TAP_SLOP, usePanes, useSwipeOpens } from "./panes.tsx";

/// Lets a screen's menu button open the sidebar.
const SidebarHandle = createContext<{ open(): void; close(): void } | null>(null);
export const useSidebarDrawer = () => useContext(SidebarHandle);

/// How much of the screen's left edge stays with the system's swipe back, on a page you
/// can go back from.
export const BACK_EDGE = 24;

/// How wide the left edge is where the sidebar opens from, on a page that swipes sideways
/// itself.
const OPEN_EDGE = 28;

/// Like Claude's: the sidebar waits behind the whole app, and the page, whatever it is and
/// with its own bar, slides aside to show it, its corners rounded. A swipe to the right
/// anywhere opens it, except at the very edge of a page you can go back from, where the
/// system takes it as "back". Swiping the other way is left to the page (its details),
/// and while those are out the sidebar waits: from there a swipe goes back to the page.
export function SidebarDrawer(props: SidebarDrawerProps) {
  return (
    <PanesProvider>
      <SidebarDrawerBody {...props} />
    </PanesProvider>
  );
}

interface SidebarDrawerProps {
  /// Off over sign in and the welcome screen.
  enabled: boolean;
  /// Whether the current page has a page to go back to.
  edgeBack: boolean;
  children: ReactNode;
}

function SidebarDrawerBody({ enabled, edgeBack, children }: SidebarDrawerProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const panes = usePanes();
  const swipeOpens = useSwipeOpens();
  const open = panes?.sidebarOpen ?? false;
  const edgeOnly = panes?.sidebarEdgeOnly ?? false;
  const setOpen = panes?.setSidebarOpen;
  const handle = useMemo(
    () => ({ open: () => setOpen?.(true), close: () => setOpen?.(false) }),
    [setOpen],
  );
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
      (open
        ? gesture.activeOffsetX([-TAP_SLOP, TAP_SLOP])
        : gesture.activeOffsetX([-NEVER, TAP_SLOP]).failOffsetX([-TAP_SLOP, NEVER])
      )
        // A negative slop moves the edge in: the back swipe keeps the first points.
        .hitSlop({
          left: open ? 0 : -inset,
          width: open ? undefined : edgeOnly ? OPEN_EDGE : width - inset,
        })
        .withTestId("sidebar-swipe"),
    [open, inset, width, edgeOnly],
  );
  return (
    <Drawer
      open={open}
      onOpen={() => setOpen?.(true)}
      onClose={() => setOpen?.(false)}
      drawerType="back"
      swipeEnabled={enabled && swipeOpens.sidebar}
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
        <View testID="sidebar-page" className="flex-1" style={insetPageStyle(theme.colors.page)}>
          <DetailsDrawer>{children}</DetailsDrawer>
        </View>
      </SidebarHandle.Provider>
    </Drawer>
  );
}
