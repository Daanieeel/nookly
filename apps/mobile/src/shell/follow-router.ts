import { useNavigationContainerRef, useRootNavigationState } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { devHooks } from "../dev/hooks.ts";
import type { NavigationState } from "expo-router/react-navigation";
import { z } from "zod";
import { type PageKind, RouteParamsSchema, type RouteParams, matchPage, pathOf } from "./pages.tsx";

interface RouteLike {
  key?: string;
  name: string;
  params?: RouteParams;
  state?: StateLike;
}
export interface StateLike {
  index?: number;
  routes: RouteLike[];
}

const RouteSchema: z.ZodType<RouteLike> = z.lazy(() =>
  z.object({
    key: z.string().optional(),
    name: z.string(),
    params: RouteParamsSchema.optional(),
    state: StateSchema.optional(),
  }),
);
const StateSchema: z.ZodType<StateLike> = z.lazy(() =>
  z.object({ index: z.number().optional(), routes: z.array(RouteSchema) }),
);

/// The router's state, read as plain data (it is: the router saves it).
export function parseRouterState(raw: NavigationState | undefined): StateLike | undefined {
  if (!raw) return undefined;
  return StateSchema.safeParse(JSON.parse(JSON.stringify(raw))).data;
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
    const params = route.params ?? {};
    const screen = z.string().safeParse(params.screen).data;
    // A navigator never drawn holds a made up first state (its routes have no keys) and
    // the page it was sent to in its params.
    const mounted = route.state?.routes?.every((r) => r.key !== undefined) ?? false;
    if (route.state?.routes?.length && (mounted || screen === undefined)) {
      prefix = `${prefix}/${route.name}`;
      route = route.state.routes[route.state.index ?? route.state.routes.length - 1];
      key = route.key ?? `${key}/${route.name}`;
      continue;
    }
    if (screen !== undefined) {
      prefix = `${prefix}/${route.name}`;
      route = { name: screen, params: RouteParamsSchema.safeParse(params.params).data ?? {} };
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

/// On a tablet each page the router is sent to stays on its stack as an empty screen (the
/// shell draws the page). Past `STACK_LIMIT` screens the stack drops all but the last
/// `STACK_KEEP`, so a long session does not draw and read an ever longer stack, and a page
/// that goes back through the router still finds the one before.
export const STACK_LIMIT = 12;
const STACK_KEEP = 4;

interface StackOwner {
  getRootState(): NavigationState;
  dispatch(action: { type: string; payload?: object; target?: string }): void;
}

/// A stack's state, all of it kept for the reset (its route names and the rest).
const StackSchema = z.looseObject({
  key: z.string(),
  type: z.literal("stack"),
  index: z.number(),
  routes: z.array(z.looseObject({ key: z.string() })),
});

/// The stack the router's pages go on: the one under the root's first route.
function pageStack(root: NavigationState) {
  return StackSchema.safeParse(root.routes[0]?.state).data;
}

export function trimStack(container: StackOwner) {
  const stack = pageStack(container.getRootState());
  if (!stack || stack.routes.length <= STACK_LIMIT) return;
  // Only with the page on top: something shown over the window stays as it is.
  if (stack.index !== stack.routes.length - 1) return;
  const routes = stack.routes.slice(-STACK_KEEP);
  container.dispatch({
    type: "RESET",
    payload: { ...stack, routes, index: routes.length - 1 },
    target: stack.key,
  });
}

/// Follows the router on a tablet: a page it is sent to (a row's tap, a link, the
/// sidebar's `router.push`) opens in the tablet's tabs instead of a stack. Create forms,
/// pickers and other modals stay the router's and are left alone.
export function useFollowRouter(follower: RouterFollower) {
  // The root layout is not drawn again on every step of the router: listen for each.
  const root = useRootNavigationState();
  const initial = useMemo(() => parseRouterState(root), [root]);
  const container = useNavigationContainerRef();
  const [latestState, setLatestState] = useState<StateLike | undefined>(undefined);
  useEffect(
    () =>
      container.addListener("state", () =>
        setLatestState(parseRouterState(container.getRootState())),
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
    trimStack(container);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the signature names the route
  }, [signature]);
}
