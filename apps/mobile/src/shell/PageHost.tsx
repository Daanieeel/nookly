import { router } from "expo-router";
import { LocalRouteParamsContext } from "expo-router/build/Route";
import { NavigationContext, NavigationRouteContext } from "expo-router/react-navigation";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import type { PageMatch } from "./pages.tsx";

/// Where a page sits in the tablet's window: its tab and group, and whether it shows.
export interface PageHostValue {
  tabId: string;
  groupId: string;
  path: string;
  /// The tab is the one its group shows, and the group is on screen.
  active: boolean;
  /// Its group is the focused one (the one the sidebar and shortcuts act on).
  focused: boolean;
}

const PageHostContext = createContext<PageHostValue | null>(null);

/// The tablet page this is in, or null on a phone (or over the window, in a sheet).
export function usePageHost(): PageHostValue | null {
  return useContext(PageHostContext);
}

/// The titles pages give themselves (`<Stack.Screen options={{ title }} />`), by tab and
/// path, for the tabs and the titlebar's crumbs.
export const usePageTitles = create<{ titles: Record<string, string> }>(() => ({ titles: {} }));

export const titleKey = (tabId: string, path: string) => `${tabId} ${path}`;

type Listener = (event: { type: string }) => void;

/// The navigation object a page reaches with `useNavigation()`: on a tablet a page is not a
/// screen of a stack but a tab of the shell, so this answers for it. Titles it is given go to
/// the tabs, focus follows the tab, and going somewhere goes through the router (which the
/// shell follows).
function pageNavigation(
  host: () => PageHostValue,
  listeners: Map<string, Set<Listener>>,
  params: Record<string, string>,
) {
  const navigation = {
    isFocused: () => host().active,
    setOptions: (options: { title?: string }) => {
      const { tabId, path } = host();
      if (options.title) {
        const key = titleKey(tabId, path);
        if (usePageTitles.getState().titles[key] !== options.title) {
          usePageTitles.setState((s) => ({ titles: { ...s.titles, [key]: options.title ?? "" } }));
        }
      }
    },
    addListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
      return () => set.delete(listener);
    },
    removeListener: (type: string, listener: Listener) => listeners.get(type)?.delete(listener),
    getId: () => undefined,
    getParent: () => undefined,
    getState: () => ({ index: 0, routes: [{ key: host().path, name: host().path, params }] }),
    canGoBack: () => router.canGoBack(),
    goBack: () => router.back(),
    navigate: (...args: Parameters<typeof router.navigate>) => router.navigate(...args),
    push: (...args: Parameters<typeof router.push>) => router.push(...args),
    replace: (...args: Parameters<typeof router.replace>) => router.replace(...args),
    setParams: () => {},
    dispatch: () => {},
    emit: () => {},
  };
  return navigation;
}

/// One page of a tab: the route's own component, given its params and a navigation of its
/// own, so the phone's screens work unchanged as tablet pages.
export function PageHost({ page, host }: { page: PageMatch; host: PageHostValue }) {
  const current = useRef(host);
  current.current = host;
  const listeners = useRef(new Map<string, Set<Listener>>()).current;
  const { params } = page;
  const navigation = useMemo(
    () => pageNavigation(() => current.current, listeners, params),
    [listeners, params],
  );
  const route = useMemo(
    () => ({ key: `${host.tabId} ${host.path}`, name: page.pattern, params }),
    [host.tabId, host.path, page.pattern, params],
  );
  // A tab that comes to the front is a screen coming into focus.
  const wasActive = useRef(host.active);
  useEffect(() => {
    if (wasActive.current === host.active) return;
    wasActive.current = host.active;
    for (const listener of listeners.get(host.active ? "focus" : "blur") ?? []) {
      listener({ type: host.active ? "focus" : "blur" });
    }
  }, [host.active, listeners]);
  const { Component } = page;
  // SAFETY: the page's navigation answers what screens ask of one (see above).
  const navigationValue = navigation as never;
  // SAFETY: the route carries a screen's key, name and params, all a page reads of it.
  const routeValue = route as never;
  return (
    <PageHostContext.Provider value={host}>
      <NavigationContext.Provider value={navigationValue}>
        <NavigationRouteContext.Provider value={routeValue}>
          <LocalRouteParamsContext.Provider value={params}>
            <Component />
          </LocalRouteParamsContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    </PageHostContext.Provider>
  );
}

export function PageHostProvider({
  value,
  children,
}: {
  value: PageHostValue | null;
  children: ReactNode;
}) {
  return <PageHostContext.Provider value={value}>{children}</PageHostContext.Provider>;
}
