import "../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { InterTight_600SemiBold } from "@expo-google-fonts/inter-tight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { type AppData, AppDataProvider } from "../data/context.tsx";
import { openLocalDb } from "../data/database.ts";
import { keys } from "../data/keys.ts";
import { restoreTheme } from "../data/appearance.ts";
import { createSync, serverUrlStore, themeStore } from "../data/sync.ts";

// Before the first frame, so a picked theme never flashes the system's.
restoreTheme(themeStore);
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

const queryClient = new QueryClient({
  defaultOptions: { queries: { networkMode: "always" }, mutations: { networkMode: "always" } },
});

/// Opens the phone's database and carries on with the saved sync sign in, if any.
async function start(): Promise<AppData> {
  const db = await openLocalDb();
  const sync = createSync(db, () => void queryClient.invalidateQueries({ queryKey: keys.local }));
  void sync.restore(serverUrlStore.get());
  const automation = process.env.EXPO_PUBLIC_AUTOMATION_URL;
  if (automation) {
    // End to end checks only (`tools/e2e/mobile.ts`); no such address in a normal build.
    const { startAutomation } = await import("../dev/automation.ts");
    startAutomation(automation, process.env.EXPO_PUBLIC_AUTOMATION_DEVICE ?? "phone", {
      db,
      sync,
      queryClient,
      router,
    });
  }
  return { db, sync, serverUrl: serverUrlStore, theme: themeStore };
}

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    InterTight_600SemiBold,
  });
  const [data, setData] = useState<AppData | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    start().then(setData, (error: Error) => setFailure(error.message));
  }, []);

  if (failure) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: theme.colors.page,
        }}
      >
        <Text>Nookly couldn't open its data: {failure}</Text>
      </View>
    );
  }
  if (!fontsLoaded || !data) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.page,
        }}
      >
        <ActivityIndicator color={theme.colors.mutedForeground} />
      </View>
    );
  }

  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navigation = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      // Behind every page: the sidebar's background, so the page's rounded corners only
      // ever show the sidebar's color around them. The pages paint their own (`Screen`).
      background: theme.colors.background,
      card: theme.colors.page,
      text: theme.colors.foreground,
      border: theme.colors.border,
    },
  };
  return (
    <GestureHandlerRootView className="flex-1 bg-background">
      <QueryClientProvider client={queryClient}>
        <AppDataProvider value={data}>
          <ThemeProvider value={navigation}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerLargeTitle: false, headerShadowVisible: false }}>
              <Stack.Screen
                name="(drawer)"
                options={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              />
              <Stack.Screen name="entity/[id]" options={{ title: "" }} />
              <Stack.Screen name="settings" options={{ title: "Settings" }} />
              <Stack.Screen
                name="new/task"
                options={{
                  title: "New Task",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.6, 1],
                }}
              />
              <Stack.Screen
                name="new/page"
                options={{
                  title: "New Page",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.5],
                }}
              />
              <Stack.Screen
                name="new/entry"
                options={{
                  title: "New Calendar Entry",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.75, 1],
                }}
              />
              <Stack.Screen
                name="new/bookmark"
                options={{
                  title: "New Bookmark",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.5],
                }}
              />
              <Stack.Screen
                name="new/space"
                options={{
                  title: "New Space",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.6],
                }}
              />
              <Stack.Screen
                name="new/course"
                options={{
                  title: "New Course",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.5],
                }}
              />
              <Stack.Screen
                name="new/exam"
                options={{
                  title: "New Exam",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.75, 1],
                }}
              />
              <Stack.Screen
                name="new/assignment"
                options={{
                  title: "New Assignment",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.75, 1],
                }}
              />
              <Stack.Screen
                name="new/deck"
                options={{
                  title: "New Deck",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.6, 1],
                }}
              />
              <Stack.Screen
                name="new/link"
                options={{
                  title: "Link an Item",
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.75, 1],
                }}
              />
              <Stack.Screen name="conflicts" options={{ title: "Conflicts" }} />
              <Stack.Screen
                name="study/[deckId]"
                options={{ title: "Study", presentation: "fullScreenModal" }}
              />
            </Stack>
          </ThemeProvider>
        </AppDataProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
