import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { InterTight_600SemiBold } from "@expo-google-fonts/inter-tight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { type AppData, AppDataProvider } from "../data/context.tsx";
import { openLocalDb } from "../data/database.ts";
import { keys } from "../data/keys.ts";
import { createSync, serverUrlStore } from "../data/sync.ts";
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
  return { db, sync, serverUrl: serverUrlStore };
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
          backgroundColor: theme.colors.background,
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
          backgroundColor: theme.colors.background,
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
      background: theme.colors.background,
      card: theme.colors.card,
      text: theme.colors.foreground,
      border: theme.colors.border,
    },
  };
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppDataProvider value={data}>
          <ThemeProvider value={navigation}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerLargeTitle: false, headerShadowVisible: false }}>
              <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
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
