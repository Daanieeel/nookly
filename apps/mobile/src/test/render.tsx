import { ApiClient } from "@nookly/shared/api";
import type { LocalDb } from "@nookly/shared/data";
import { SyncRuntime } from "@nookly/shared/sync";
import { NodeSqliteDriver } from "@nookly/shared/testing";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderRouter } from "expo-router/testing-library";
import type { ComponentType, ReactNode } from "react";
import { AppDataProvider, type Preference } from "../data/context.tsx";
import type { MobileSync } from "../data/sync.ts";

let ids = 0;

/// A phone's data for a test: a real SQLite database with the desktop's schema, and
/// sync that stays off.
export interface TestData {
  db: LocalDb;
  driver: NodeSqliteDriver;
  sync: MobileSync;
  serverUrl: Preference;
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
  return { db, driver, sync, serverUrl };
}

/// Renders screens as routes of the app, inside its providers.
export async function renderScreens(
  routes: Record<string, ComponentType>,
  data = testData(),
  initialUrl = "/",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AppDataProvider value={{ db: data.db, sync: data.sync, serverUrl: data.serverUrl }}>
        {children}
      </AppDataProvider>
    </QueryClientProvider>
  );
  const result = await renderRouter(routes, { initialUrl, wrapper });
  return { ...result, ...data };
}
