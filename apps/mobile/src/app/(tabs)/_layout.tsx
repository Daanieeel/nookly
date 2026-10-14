import {
  IconCalendarEvent,
  IconChecklist,
  IconLayoutDashboard,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react-native";
import { Tabs } from "expo-router/js-tabs";
import { useTheme } from "../../ui/theme.ts";

/// The same top level as the desktop's sidebar: Dashboard, Calendar and Tasks across
/// every Space, the Spaces themselves, and Search (with Recents).
export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTintColor: theme.colors.foreground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <IconLayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <IconCalendarEvent color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => <IconChecklist color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="spaces"
        options={{
          title: "Spaces",
          tabBarIcon: ({ color, size }) => <IconStack2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => <IconSearch color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
