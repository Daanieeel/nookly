import "../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { InterTight_600SemiBold } from "@expo-google-fonts/inter-tight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  router,
  useRootNavigationState,
  usePathname,
  useRouter,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SidebarDrawer } from "../shell/SidebarDrawer.tsx";
import { TabletShell } from "../shell/TabletShell.tsx";

import { SidebarBesideProvider, useIsTablet } from "../ui/pane.tsx";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { type AppData, AppDataProvider, useAppData } from "../data/context.tsx";
import { backUpBeforeSync } from "../data/backup.ts";
import { openLocalDb } from "../data/database.ts";
import { keys } from "../data/keys.ts";
import { restoreTheme } from "../data/appearance.ts";
import { createSync, onboardedStore, serverUrlStore, themeStore } from "../data/sync.ts";

// Before the first frame, so a picked theme never flashes the system's.
restoreTheme(themeStore);
import { SheetHost } from "../ui/sheet/SheetHost.tsx";
import { SHEET_ROUTE } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

/// The pages of the sidebar itself: nothing to go back to from them.
const TOP_LEVEL = /^\/($|calendar|tasks|pinned|search|trash|space\/|module\/)/;

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
    const { automationDevice } = await import("../dev/device.ts");
    startAutomation(automation, automationDevice(), {
      db,
      sync,
      queryClient,
      router,
      // The data functions, to set a scene from a script.
      data: await import("@nookly/shared/data"),
      tabs: (await import("../shell/tabs-store.ts")).tabActions,
    });
  }
  return {
    db,
    sync,
    serverUrl: serverUrlStore,
    theme: themeStore,
    onboarded: onboardedStore,
    backup: () => backUpBeforeSync(db.sqlite),
  };
}

/// A phone that never answered the welcome screen opens on it, once.
function FirstRun() {
  const { onboarded } = useAppData();
  const router = useRouter();
  const ready = useRootNavigationState()?.key;
  useEffect(() => {
    if (ready && !onboarded.get()) router.push("/welcome");
  }, [ready, onboarded, router]);
  return null;
}

export default function RootLayout() {
  const theme = useTheme();
  const pathname = usePathname();
  // The sidebar sits beside the page on a tablet, but not over signing in.
  const beside = useIsTablet() && !/^\/(welcome|account)/.test(pathname);
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
  const stack = (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerShadowVisible: false,
        // The arrow alone: the screen behind has no title worth naming.
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen
        name="(drawer)"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
      <Stack.Screen
        name="welcome"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="account/sign-in" options={{ title: "Sign In" }} />
      <Stack.Screen name="account/sign-up" options={{ title: "Create Account" }} />
      <Stack.Screen name="account/forgot" options={{ title: "Reset Password" }} />
      <Stack.Screen name="entity/[id]" options={{ title: "" }} />
      <Stack.Screen name="space-settings/[id]" options={{ title: "Space Settings" }} />
      <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
      <Stack.Screen name="settings/[page]" options={{ title: "Settings" }} />
      <Stack.Screen name="pick/icon" options={SHEET_ROUTE} />
      <Stack.Screen name="new/recipe" options={SHEET_ROUTE} />
      <Stack.Screen name="new/session" options={SHEET_ROUTE} />
      <Stack.Screen name="new/study-block" options={SHEET_ROUTE} />
      <Stack.Screen name="new/semester" options={SHEET_ROUTE} />
      <Stack.Screen name="new/semester-setup" options={SHEET_ROUTE} />
      <Stack.Screen name="new/jot" options={SHEET_ROUTE} />
      <Stack.Screen name="assignments" options={{ title: "Assignments" }} />
      <Stack.Screen name="settings/sidebar" options={{ title: "Sidebar" }} />
      <Stack.Screen name="settings/shortcuts" options={{ title: "Keyboard Shortcuts" }} />
      <Stack.Screen name="settings/whats-new" options={{ title: "What's New" }} />
      <Stack.Screen name="new/task" options={SHEET_ROUTE} />
      <Stack.Screen name="new/page" options={SHEET_ROUTE} />
      <Stack.Screen name="new/entry" options={SHEET_ROUTE} />
      <Stack.Screen name="new/bookmark" options={SHEET_ROUTE} />
      <Stack.Screen name="new/space" options={SHEET_ROUTE} />
      <Stack.Screen name="new/course" options={SHEET_ROUTE} />
      <Stack.Screen name="new/exam" options={SHEET_ROUTE} />
      <Stack.Screen name="new/assignment" options={SHEET_ROUTE} />
      <Stack.Screen name="new/import" options={SHEET_ROUTE} />
      <Stack.Screen name="new/deck" options={SHEET_ROUTE} />
      <Stack.Screen name="new/share" options={SHEET_ROUTE} />
      <Stack.Screen name="conflicts" options={{ title: "Review Changes" }} />
      <Stack.Screen
        name="study/[deckId]"
        options={{ title: "Study", presentation: "fullScreenModal" }}
      />
    </Stack>
  );
  return (
    <GestureHandlerRootView className="flex-1 bg-background">
      <QueryClientProvider client={queryClient}>
        <AppDataProvider value={data}>
          <ThemeProvider value={navigation}>
            <SheetHost>
              <StatusBar style="auto" />
              <FirstRun />
              {beside ? (
                <TabletShell>{stack}</TabletShell>
              ) : (
                <SidebarBesideProvider value={false}>
                  <SidebarDrawer
                    enabled={!/^\/(welcome|account)/.test(pathname)}
                    edgeBack={!TOP_LEVEL.test(pathname)}
                  >
                    {stack}
                  </SidebarDrawer>
                </SidebarBesideProvider>
              )}
            </SheetHost>
          </ThemeProvider>
        </AppDataProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
