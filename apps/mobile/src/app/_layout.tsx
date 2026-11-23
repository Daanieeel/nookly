// The language features the engine lacks, before any other module runs.
import { TermsGate } from "../screens/TermsGate.tsx";
import { UsernameGate } from "../screens/UsernameGate.tsx";
import "../polyfills.ts";
import { pageBar } from "../shell/history.ts";
import "../global.css";
import { semanticHex } from "../ui/tokens.ts";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { InterTight_600SemiBold, InterTight_900Black } from "@expo-google-fonts/inter-tight";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  ThemeProvider,
  router,
  useRootNavigationState,
  usePathname,
  useRouter,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SidebarDrawer } from "../shell/SidebarDrawer.tsx";
import { TabletShell, tabletScreen } from "../shell/TabletShell.tsx";
import { useHandOver } from "../shell/hand-over.ts";
import { useNavigationTheme } from "../shell/navigation-theme.ts";

import { SidebarBesideProvider, useIsTablet } from "../ui/pane.tsx";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { type AppData, AppDataProvider, useAppData } from "../data/context.tsx";
import { backUpBeforeSync } from "../data/backup.ts";
import { openLocalDb } from "../data/database.ts";
import { runOnce } from "../data/run-once.ts";
import { keys } from "../data/keys.ts";
import { restoreTheme } from "../data/appearance.ts";
import { resumeWhenActive } from "../data/resume.ts";
import { createSync, onboardedStore, serverUrlStore, themeStore } from "../data/sync.ts";

// Before the first frame, so a picked theme never flashes the system's.
restoreTheme(themeStore);
import { SheetHost } from "../ui/sheet/SheetHost.tsx";
import { FirstSyncPage } from "../shell/FirstSyncPage.tsx";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { SHEET_ROUTE } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { WindowFrame } from "../dev/WindowFrame.tsx";

/// The pages of the sidebar itself: nothing to go back to from them.
const TOP_LEVEL = /^\/($|calendar|tasks|pinned|search|trash|space\/|module\/)/;

const queryClient = runOnce(
  "query-client",
  () =>
    new QueryClient({
      defaultOptions: { queries: { networkMode: "always" }, mutations: { networkMode: "always" } },
    }),
);

/// Opens the phone's database and carries on with the saved sync sign in, if any.
async function start(): Promise<AppData> {
  const db = await openLocalDb();
  const sync = createSync(db, () => void queryClient.invalidateQueries({ queryKey: keys.local }));
  void sync.restore(serverUrlStore.get());
  // Back in front, the phone finds the server at once.
  resumeWhenActive(sync);
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
      // The tablet's tabs and groups (`workspace.open(path)`, `workspaceState()`).
      workspace: (await import("../shell/workspace-store.ts")).workspace,
      workspaceState: async () =>
        (await import("../shell/workspace-store.ts")).useWorkspace.getState().ws,
      // Actions outside the React tree, like the native bar's buttons (`hooks.openSidebar()`).
      hooks: (await import("../dev/hooks.ts")).devHooks,
      // This device's settings, to turn one on for a check (`settings.setJson(id, value)`).
      settings: (await import("../data/settings.ts")).phoneSettings,
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

/// The shell for the window (D83): the tablet's, which draws its pages itself, or the
/// phone's drawer, which needs to know whether the page can go back. Kept apart from the
/// layout so a page change re-renders only this, and not the whole app with it: the stack
/// it holds is the same element from one page to the next.
function AppShell({ stack }: { stack: ReactNode }) {
  const pathname = usePathname();
  const tablet = useIsTablet();
  useHandOver(tablet, pathname);
  return tablet ? (
    <TabletShell stack={stack} />
  ) : (
    <SidebarBesideProvider value={false}>
      <SidebarDrawer
        enabled={!/^\/(welcome|account)/.test(pathname)}
        edgeBack={!TOP_LEVEL.test(pathname)}
      >
        {stack}
      </SidebarDrawer>
    </SidebarBesideProvider>
  );
}

/// How the stack shows its screens on a phone.
const PHONE_SCREEN = {
  headerLargeTitle: false,
  headerShadowVisible: false,
  // The arrow alone: the screen behind has no title worth naming.
  headerBackButtonDisplayMode: "minimal",
} as const;

/// On a tablet: its page routes are empty (`tabletScreen`), nothing to show or slide in.
const TABLET_SCREEN = {
  ...PHONE_SCREEN,
  headerShown: false,
  animation: "none",
  gestureEnabled: false,
  contentStyle: { backgroundColor: "transparent" },
} as const;

/// A page that is not a tab on a tablet (signing in) shows as a card over the window, as
/// the desktop's account dialog.
function overWindow(tablet: boolean) {
  return tablet
    ? ({ presentation: "formSheet", headerShown: true, animation: "default" } as const)
    : {};
}

export default function RootLayout() {
  const theme = useTheme();
  const navigation = useNavigationTheme();
  const tablet = useIsTablet();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    InterTight_600SemiBold,
    InterTight_900Black,
  });
  const [data, setData] = useState<AppData | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    runOnce("start", start).then(setData, (error: Error) => setFailure(error.message));
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

  // A page of grouped sections has its bar on the same grouped background, as iOS's Settings.
  const groupedHeader = {
    headerStyle: {
      backgroundColor: semanticHex("groupedBackground", theme.dark ? "dark" : "light"),
    },
  };
  const stack = (
    <Stack
      // A tablet draws its pages in its own tabs (`TabletShell`): here they are empty, and
      // the stack only shows what goes over the window.
      screenLayout={tablet ? tabletScreen : undefined}
      screenOptions={tablet ? TABLET_SCREEN : PHONE_SCREEN}
    >
      <Stack.Screen
        name="(drawer)"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: tablet ? "transparent" : theme.colors.background },
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
      {/* A tablet's are the desktop's account dialog, drawn by the screens themselves. */}
      <Stack.Screen name="account/sign-in" options={tablet ? SHEET_ROUTE : { title: "Sign In" }} />
      <Stack.Screen
        name="account/sign-up"
        options={tablet ? SHEET_ROUTE : { title: "Create Account" }}
      />
      <Stack.Screen
        name="account/forgot"
        options={tablet ? SHEET_ROUTE : { title: "Reset Password" }}
      />
      <Stack.Screen name="entity/[id]" options={{ title: "", ...pageBar(tablet) }} />
      <Stack.Screen name="file/[id]" options={{ title: "", ...pageBar(tablet) }} />
      <Stack.Screen
        name="space-settings/[id]"
        options={tablet ? SHEET_ROUTE : { title: "Space Settings" }}
      />
      {/* A tablet's Settings is the desktop's dialog over the window (8.1). */}
      <Stack.Screen
        name="settings/index"
        options={tablet ? SHEET_ROUTE : { title: "Settings", ...groupedHeader }}
      />
      <Stack.Screen
        name="settings/[page]"
        options={tablet ? SHEET_ROUTE : { title: "Settings", ...groupedHeader }}
      />
      <Stack.Screen name="pick/icon" options={SHEET_ROUTE} />
      <Stack.Screen name="new/recipe" options={SHEET_ROUTE} />
      <Stack.Screen name="new/session" options={SHEET_ROUTE} />
      <Stack.Screen name="new/semester" options={SHEET_ROUTE} />
      <Stack.Screen name="new/semester-setup" options={SHEET_ROUTE} />
      <Stack.Screen name="new/jot" options={SHEET_ROUTE} />
      <Stack.Screen name="assignments" options={{ title: "Assignments" }} />
      <Stack.Screen name="moodle/[courseId]" options={{ title: "Course" }} />
      <Stack.Screen name="moodle/assignment/[id]" options={{ title: "Assignment" }} />
      <Stack.Screen name="moodle/forum/[id]" options={{ title: "Forum" }} />
      <Stack.Screen name="moodle/discussion/[id]" options={{ title: "Discussion" }} />
      <Stack.Screen name="moodle/page/[cmid]" options={{ title: "Page" }} />
      <Stack.Screen name="moodle/file" options={{ title: "File" }} />
      <Stack.Screen name="moodle-signin" options={{ title: "Moodle", ...overWindow(tablet) }} />
      <Stack.Screen name="settings/sidebar" options={tablet ? SHEET_ROUTE : { title: "Sidebar" }} />
      <Stack.Screen
        name="settings/calendar-connections"
        options={tablet ? SHEET_ROUTE : { title: "Calendar Connections", ...groupedHeader }}
      />
      <Stack.Screen name="calendar-event" options={SHEET_ROUTE} />
      <Stack.Screen
        name="settings/shortcuts"
        options={tablet ? SHEET_ROUTE : { title: "Keyboard Shortcuts", ...groupedHeader }}
      />
      <Stack.Screen
        name="settings/whats-new"
        options={tablet ? SHEET_ROUTE : { title: "What's New" }}
      />
      <Stack.Screen
        name="settings/legal"
        options={tablet ? SHEET_ROUTE : { title: "Legal", ...groupedHeader }}
      />
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
      <Stack.Screen
        name="conflicts"
        options={tablet ? SHEET_ROUTE : { title: "Review Changes", ...groupedHeader }}
      />
      <Stack.Screen
        name="study/[deckId]"
        // The session draws its own top row: Back to Deck, the counts and Undo.
        options={{ title: "Study", headerShown: false, presentation: "fullScreenModal" }}
      />
    </Stack>
  );
  return (
    <GestureHandlerRootView className="flex-1 bg-background">
      <WindowFrame>
        <QueryClientProvider client={queryClient}>
          <AppDataProvider value={data}>
            <ThemeProvider value={navigation}>
              <SheetHost>
                <StatusBar style="auto" />
                <FirstRun />
                <TermsGate />
                <UsernameGate />
                <AppShell stack={stack} />
                <EditorToolbar />
                <FirstSyncPage />
              </SheetHost>
            </ThemeProvider>
          </AppDataProvider>
        </QueryClientProvider>
      </WindowFrame>
    </GestureHandlerRootView>
  );
}
