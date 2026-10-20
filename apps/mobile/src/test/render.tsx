import { ApiClient } from "@nookly/shared/api";
import type { LocalDb } from "@nookly/shared/data";
import { SyncRuntime } from "@nookly/shared/sync";
import { NodeSqliteDriver } from "@nookly/shared/testing";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderRouter } from "expo-router/testing-library";
import type { ComponentType, ReactNode } from "react";
import { AppDataProvider, type Preference } from "../data/context.tsx";
import { phoneSettings } from "../data/settings.ts";
import type { MobileSync } from "../data/sync.ts";
import { MenuProvider, type MenuPresenter, nativeMenu } from "../ui/menu.tsx";
import { WindowWidthProvider } from "../ui/pane.tsx";

let ids = 0;

/// A phone's data for a test: a real SQLite database with the desktop's schema, and
/// sync that stays off.
export interface TestData {
  db: LocalDb;
  driver: NodeSqliteDriver;
  sync: MobileSync;
  serverUrl: Preference;
  theme: Preference;
  onboarded: Preference;
}

export function testData(): TestData {
  const driver = new NodeSqliteDriver();
  const db: LocalDb = {
    driver,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    now: () => new Date(),
  };
  const sync: MobileSync = new SyncRuntime<ApiClient>({
    driver,
    connect: (baseUrl) =>
      new ApiClient({ baseUrl, tokens: { load: async () => null, save: async () => {} } }),
    device: { name: "Test phone", platform: "ios" },
    onApplied: () => {},
  });
  let saved: string | null = null;
  const serverUrl: Preference = { get: () => saved, set: (value) => void (saved = value) };
  // The theme is a setting here, as on the phone.
  const themePreference: Preference = {
    get: () => phoneSettings.get("appearance.theme"),
    set: (value) => void phoneSettings.setJson("appearance.theme", value),
  };
  let onboarded: string | null = "1";
  const onboardedPreference: Preference = {
    get: () => onboarded,
    set: (value) => void (onboarded = value),
  };
  return { db, driver, sync, serverUrl, theme: themePreference, onboarded: onboardedPreference };
}

/// Renders screens as routes of the app, inside its providers.
export async function renderScreens(
  routes: Record<string, ComponentType>,
  data = testData(),
  initialUrl = "/",
  options: {
    /// A window width other than the test renderer's (a phone's).
    width?: number;
    /// Where the "more" menus of items go.
    menu?: MenuPresenter;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AppDataProvider
        value={{
          db: data.db,
          sync: data.sync,
          serverUrl: data.serverUrl,
          theme: data.theme,
          onboarded: data.onboarded,
        }}
      >
        <WindowWidthProvider value={options.width ?? null}>
          <MenuProvider value={options.menu ?? nativeMenu}>{children}</MenuProvider>
        </WindowWidthProvider>
      </AppDataProvider>
    </QueryClientProvider>
  );
  const result = await renderRouter(routes, { initialUrl, wrapper });
  return { ...result, ...data };
}
