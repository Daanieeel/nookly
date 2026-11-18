import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { act, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { keys } from "../data/keys.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { devHooks } from "../dev/hooks.ts";
import { type StateLike, resetRouterFollower } from "./follow-router.ts";
import { PAGE_ROUTES, type PageRoute } from "./pages.tsx";
import { TabletShell, tabletScreen } from "./TabletShell.tsx";
import { newWorkspace } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

/// What the probe page costs: each render, and each time it reads its data.
interface Cost {
  renders: number;
  reads: number;
  client: QueryClient | null;
}
const cost: Cost = { renders: 0, reads: 0, client: null };

/// A page of the tablet's that counts what it costs.
function ProbePage() {
  cost.renders += 1;
  cost.client = useQueryClient();
  const { data } = useQuery({
    queryKey: [...keys.local, "probe-page"],
    queryFn: async () => {
      cost.reads += 1;
      return "Probe page";
    },
  });
  return <Text>{data ?? "Loading"}</Text>;
}

const PROBE: PageRoute = { pattern: "probe", Component: ProbePage, kind: "page" };
beforeAll(() => PAGE_ROUTES.push(PROBE));
afterAll(() => PAGE_ROUTES.splice(PAGE_ROUTES.indexOf(PROBE), 1));

let n = 0;
const ids = () => `c-${++n}`;

const ROUTES = {
  _layout: () => <TabletShell stack={<Stack screenLayout={tabletScreen} />} />,
  index: () => null,
  probe: () => null,
  trash: () => null,
  pinned: () => null,
};

async function probeBehindTrash() {
  resetRouterFollower();
  act(() => useWorkspace.setState({ ws: newWorkspace(ids) }));
  const screen = await renderScreens(ROUTES, testData(), "/", { width: 1376, height: 1032 });
  act(() => workspace.open("/probe", "here"));
  await screen.findByText("Probe page");
  act(() => workspace.open("/trash", "newTab"));
  await waitFor(() => expect(useWorkspace.getState().ws.layout.groups[0].tabs).toHaveLength(2));
  return screen;
}

beforeEach(() => {
  cost.renders = 0;
  cost.reads = 0;
});

// From the user on a real iPad: the app paused on tapping anything. Every tab kept drawn
// rendered again, and read its data again, for a step in any other tab.
describe("a tab kept out of sight", () => {
  it("does not render again while other tabs change", async () => {
    await probeBehindTrash();
    const before = cost.renders;
    act(() => workspace.open("/pinned", "here"));
    act(() => workspace.back());
    act(() => workspace.open("/", "right"));
    expect(cost.renders).toBe(before);
  });

  it("does not read its data again after a change, until it shows again", async () => {
    const screen = await probeBehindTrash();
    const before = cost.reads;
    await act(() => cost.client?.invalidateQueries({ queryKey: keys.local }));
    expect(cost.reads).toBe(before);
    const probe = useWorkspace.getState().ws.layout.groups[0].tabs[0];
    act(() => workspace.select(probe.id));
    await waitFor(() => expect(cost.reads).toBe(before + 1));
    expect(screen.getByText("Probe page")).toBeTruthy();
  });
});

/// The router's own stack: on a tablet each page it was sent to is an empty screen there.
function routerStack(): StateLike["routes"] {
  const state = devHooks.routerState?.();
  return state?.routes[0]?.state?.routes ?? [];
}

// Every page opened stayed on the router's stack as an empty screen, so each step of a
// long session drew and read a longer stack.
describe("the router's stack on a tablet", () => {
  it("stays short however many pages are opened", async () => {
    await probeBehindTrash();
    for (let i = 0; i < 30; i++) {
      act(() => router.navigate(`/pinned?step=${i}`));
      act(() => router.navigate(`/trash?step=${i}`));
    }
    expect(routerStack().length).toBeLessThanOrEqual(12);
    expect(useWorkspace.getState().ws.layout.groups[0].tabs[1].view).toBe("/trash?step=29");
    // A page that goes back through the router still steps back in its tab.
    act(() => router.back());
    await waitFor(() =>
      expect(useWorkspace.getState().ws.layout.groups[0].tabs[1].view).toBe("/pinned?step=29"),
    );
  });
});
