import { Drawer, DrawerToggleButton } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";
import { Sidebar } from "../../screens/Sidebar.tsx";
import { PageEdge, insetPageStyle } from "../../ui/inset-page.tsx";
import { useTheme } from "../../ui/theme.ts";

/// The sidebar, with the page's edge drawn over it.
function SidebarContent({ close, width }: { close: () => void; width: number }) {
  const theme = useTheme();
  return (
    <>
      <Sidebar close={close} />
      <PageEdge drawerWidth={width} dark={theme.dark} />
    </>
  );
}

/// Like Claude's: the sidebar waits behind the page, and the page slides aside to show
/// it, its corners rounded and its edge outlined. Open it from the menu button or with
/// a swipe to the right anywhere on the page (a row with its own swipe actions keeps
/// its swipe). Details open on top, with a back button.
export default function DrawerLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.82, 340);
  return (
    <Drawer
      drawerContent={({ navigation }) => (
        <SidebarContent close={() => navigation.closeDrawer()} width={drawerWidth} />
      )}
      screenOptions={{
        drawerType: "back",
        swipeEdgeWidth: width,
        overlayColor: "transparent",
        sceneStyle: insetPageStyle(theme.colors.page),
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: theme.colors.background,
        },
        headerStyle: { backgroundColor: theme.colors.page },
        headerShadowVisible: false,
        headerTintColor: theme.colors.foreground,
        headerLeft: () => (
          <DrawerToggleButton
            tintColor={theme.colors.foreground}
            accessibilityLabel="Open Sidebar"
          />
        ),
      }}
    >
      <Drawer.Screen name="index" options={{ title: "Dashboard" }} />
      <Drawer.Screen name="calendar" options={{ title: "Calendar" }} />
      <Drawer.Screen name="tasks" options={{ title: "Tasks" }} />
      <Drawer.Screen name="search" options={{ title: "Search" }} />
      <Drawer.Screen name="trash" options={{ title: "Trash" }} />
      <Drawer.Screen name="space/[id]" options={{ title: "Space" }} />
      <Drawer.Screen name="module/[spaceId]/[module]" options={{ title: "" }} />
    </Drawer>
  );
}
