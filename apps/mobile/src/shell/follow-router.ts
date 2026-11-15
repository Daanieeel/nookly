import { useNavigationContainerRef, useRootNavigationState } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { devHooks } from "../dev/hooks.ts";
import { type PageKind, matchPage, pathOf } from "./pages.tsx";

interface RouteLike {
  key?: string;
  name: string;
  params?: Record<string, unknown>;
  state?: StateLike;
}
interface StateLike {
  index?: number;
  routes: RouteLike[];
}

/// The route the router shows, as a key and a path. A layout the tablet does not draw
/// (the top level pages' stack) holds where to go only in its params (`screen`), which
/// stand for the route inside it.
export function shownRoute(state: StateLike | undefined): { key: string; path: string } | null {
  if (!state?.routes?.length) return null;
  let route = state.routes[state.index ?? state.routes.length - 1];
  let key = route.key ?? route.name;
  let prefix = "";
  for (;;) {
    // A navigator never drawn holds a made up first state (its routes have no keys) and
    // the page it was sent to in its params.
    const mounted = route.state?.routes?.every((r) => r.key !== undefined) ?? false;
    if (route.state?.routes?.length && (mounted || typeof route.params?.screen !== "string")) {
      prefix = `${prefix}/${route.name}`;
      route = route.state.routes[route.state.index ?? route.state.routes.length - 1];
      key = route.key ?? `${key}/${route.name}`;
      continue;
    }
    const params = route.params ?? {};
    if (typeof params.screen === "string") {
      prefix = `${prefix}/${route.name}`;
      route = {
        name: params.screen,
        params: (params.params as Record<string, unknown> | undefined) ?? {},
      };
      continue;
    }
    break;
  }
  return { key, path: pathOf(`${prefix}/${route.name}`, route.params ?? {}) };
}

/// What the shell does when the router shows a page.
export interface RouterFollower {
  /// A page the router was sent to.
  opened(path: string, kind: PageKind): void;
  /// The router went back to a page it showed before (`router.back()` from a page).
  returned(path: string): void;
}

/// What the follower has seen, kept outside the shell so it survives the shell being drawn
/// again (a window crossing from medium to expanded).
const memory = {
  seen: { current: new Map<string, string>() },
  first: { current: true },
  /// Whether the router showed something over the window last (a sheet, signing in).
  overWindow: { current: false },
};

/// For tests: forget what the follower saw.
export function resetRouterFollower() {
  memory.seen.current = new Map();
  memory.first.current = true;
  memory.overWindow.current = false;
}

/// Follows the router on a tablet: a page it is sent to (a row's tap, a link, the
/// sidebar's `router.push`) opens in the tablet's tabs instead of a stack. Create forms,
/// pickers and other modals stay the router's and are left alone.
export function useFollowRouter(follower: RouterFollower) {
  // The root layout is not drawn again on every step of the router: listen for each.
  const initial = useRootNavigationState() as StateLike | undefined;
  const container = useNavigationContainerRef();
  const [latestState, setLatestState] = useState<StateLike | undefined>(undefined);
  useEffect(
    () =>
      container.addListener("state", () =>
        setLatestState(container.getRootState() as StateLike | undefined),
      ),
    [container],
  );
  const state = latestState ?? initial;
  const shown = shownRoute(state);
  devHooks.routerState = () => state;
  const { seen, first, overWindow } = memory;
  const latest = useRef(follower);
  latest.current = follower;
  const signature = shown ? `${shown.key} ${shown.path}` : null;
  useEffect(() => {
    if (!shown || !signature) return;
    const page = matchPage(shown.path);
    const before = seen.current.has(signature);
    seen.current.set(signature, shown.path);
    if (first.current) {
      first.current = false;
      // The app opened on a link to a page: show it; else the saved tabs stand.
      if (page && shown.path !== "/") latest.current.opened(shown.path, page.kind);
      return;
    }
    const wasOver = overWindow.current;
    overWindow.current = !page;
    if (!page) return;
    // Closing a sheet shows the page under it again: nothing to follow.
    if (before && wasOver) return;
    if (before) latest.current.returned(shown.path);
    else latest.current.opened(shown.path, page.kind);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the signature names the route
  }, [signature]);
}
