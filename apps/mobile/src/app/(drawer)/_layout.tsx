import { Stack } from "expo-router";
import { useSidebarBeside } from "../../ui/pane.tsx";
import { useSidebarDrawer } from "../../shell/SidebarDrawer.tsx";
import { useTheme } from "../../ui/theme.ts";
import { barButton } from "../../ui/bar.ts";
import { TOOLBAR_ICONS } from "../../ui/toolbar-icons.ts";

/// The app's top level pages. The sidebar is the root layout's drawer around the whole
/// stack, so it opens from any page; here is its menu button, except on a tablet where
/// the sidebar already sits beside the page.
export default function TopLevelLayout() {
  const theme = useTheme();
  const beside = useSidebarBeside();
  const drawer = useSidebarDrawer();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.page },
        headerStyle: { backgroundColor: theme.colors.page },
        headerShadowVisible: false,
        headerTintColor: theme.colors.foreground,
        unstable_headerLeftItems: () =>
          beside || !drawer
            ? []
            : [
                barButton({
                  label: "Open Sidebar",
                  icon: TOOLBAR_ICONS.menu,
                  onPress: drawer.open,
                }),
              ],
      }}
    >
      <Stack.Screen name="index" options={{ title: "Dashboard" }} />
      <Stack.Screen name="calendar" options={{ title: "Calendar" }} />
      <Stack.Screen name="tasks" options={{ title: "Tasks" }} />
      <Stack.Screen name="search" options={{ title: "Search" }} />
      <Stack.Screen name="pinned" options={{ title: "Pinned" }} />
      <Stack.Screen name="trash" options={{ title: "Trash" }} />
      <Stack.Screen name="space/[id]" options={{ title: "Space" }} />
      <Stack.Screen name="module/[spaceId]/[module]" options={{ title: "" }} />
    </Stack>
  );
}
