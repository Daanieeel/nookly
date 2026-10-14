import { Drawer, DrawerToggleButton } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";
import { Sidebar } from "../../screens/Sidebar.tsx";
import { useTheme } from "../../ui/theme.ts";

/// The sidebar slides the page aside, like Claude's and the desktop's sidebar: open it
/// from the menu button or with a swipe to the right anywhere on the page (a row with
/// its own swipe actions keeps its swipe). Details open on top, with a back button.
export default function DrawerLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  return (
    <Drawer
      drawerContent={({ navigation }) => <Sidebar close={() => navigation.closeDrawer()} />}
      screenOptions={{
        drawerType: "slide",
        swipeEdgeWidth: width,
        overlayColor: theme.dark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)",
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
