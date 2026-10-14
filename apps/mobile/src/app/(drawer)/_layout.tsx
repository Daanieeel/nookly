import { Drawer, DrawerToggleButton } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";
import { Sidebar } from "../../screens/Sidebar.tsx";
import { insetPageStyle, usePageAside, useWatchPageAside } from "../../ui/inset-page.ts";
import { useTheme } from "../../ui/theme.ts";

/// The sidebar content, which also tells the page when it starts sliding aside.
function SidebarContent({ close }: { close: () => void }) {
  useWatchPageAside();
  return <Sidebar close={close} />;
}

/// Like Claude's: the sidebar waits behind the page, and the page slides aside to show
/// it, its corners rounded and its edge outlined. Open it from the menu button or with
/// a swipe to the right anywhere on the page (a row with its own swipe actions keeps
/// its swipe). Details open on top, with a back button.
export default function DrawerLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const aside = usePageAside((s) => s.aside);
  return (
    <Drawer
      drawerContent={({ navigation }) => <SidebarContent close={() => navigation.closeDrawer()} />}
      screenOptions={{
        drawerType: "back",
        swipeEdgeWidth: width,
        overlayColor: "transparent",
        sceneStyle: insetPageStyle(aside, theme.colors, theme.dark),
        drawerStyle: {
          width: Math.min(width * 0.82, 340),
          backgroundColor: theme.colors.background,
        },
        headerStyle: { backgroundColor: theme.colors.background },
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
