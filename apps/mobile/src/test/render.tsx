import { DetailsDrawer } from "../shell/DetailsDrawer.tsx";
import { ApiClient } from "@nookly/shared/api";
import type { LocalDb } from "@nookly/shared/data";
import { SyncRuntime } from "@nookly/shared/sync";
import { NodeSqliteDriver } from "@nookly/shared/testing";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { act, waitFor } from "@testing-library/react-native";
import type { ComponentType, ReactNode } from "react";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { AppDataProvider, type Preference } from "../data/context.tsx";
import { phoneSettings } from "../data/settings.ts";
import type { MobileSync } from "../data/sync.ts";
import { MenuProvider, type MenuPresenter } from "../ui/menu.tsx";
import { SheetHost } from "../ui/sheet/SheetHost.tsx";
import { ClipboardProvider, type ClipboardWriter, systemClipboard } from "../ui/clipboard.tsx";
import { FilePickerProvider, type TextFilePicker, systemFilePicker } from "../ui/file-picker.tsx";
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
    /// Where copied text goes.
    clipboard?: ClipboardWriter;
    /// What the file picker hands over.
    filePicker?: TextFilePicker;
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
          <SheetHost>
            <MenuProvider value={options.menu ?? null}>
              <ClipboardProvider value={options.clipboard ?? systemClipboard}>
                <FilePickerProvider value={options.filePicker ?? systemFilePicker}>
                  {children}
                </FilePickerProvider>
              </ClipboardProvider>
            </MenuProvider>
          </SheetHost>
        </WindowWidthProvider>
      </AppDataProvider>
    </QueryClientProvider>
  );
  // A page's native bar buttons (`Stack.Toolbar`) need a stack around the page, and on a
  // phone an item's details wait behind the whole stack, as in the app's frame.
  const withStack =
    "_layout" in routes
      ? routes
      : {
          _layout: () => (
            <DetailsDrawer>
              <Stack />
            </DetailsDrawer>
          ),
          ...routes,
        };
  const result = await renderRouter(withStack, { initialUrl, wrapper });
  return { ...result, ...data };
}

type BarItem = { accessibilityLabel?: string; onPress?: () => void };
type Tree = ReactTestRendererJSON | ReactTestRendererJSON[] | null;

/// Presses a button of a page's native bar (`Stack.Toolbar`), which the system draws and
/// the test tree only holds as the bar's items.
export async function pressBarButton(screen: { toJSON(): Tree }, label: string) {
  const find = () => barItems(screen.toJSON()).find((i) => i.accessibilityLabel === label);
  await waitFor(() => expect(find()).toBeDefined());
  await act(async () => find()?.onPress?.());
}

function barItems(tree: Tree): BarItem[] {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => barItems(node));
  const own: BarItem[] = [
    ...(tree.props.headerRightBarButtonItems ?? []),
    ...(tree.props.headerLeftBarButtonItems ?? []),
  ];
  const below = (tree.children ?? []).flatMap((c) => (c instanceof Object ? [c] : []));
  return [...own, ...below.flatMap((node) => barItems(node))];
}

/// The title the page's native bar shows.
export function headerTitle(screen: { toJSON(): Tree }): string | undefined {
  const find = (tree: Tree): string | undefined => {
    if (!tree) return undefined;
    if (Array.isArray(tree)) return tree.map(find).find((t) => t !== undefined);
    if (tree.type === "RNSScreenStackHeaderConfig") return tree.props.title;
    return (tree.children ?? [])
      .flatMap((c) => (c instanceof Object ? [find(c)] : []))
      .find((t) => t !== undefined);
  };
  return find(screen.toJSON());
}
