import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Stack } from "expo-router";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { renderScreens, testData } from "../test/render.tsx";
import { resetRouterFollower } from "./follow-router.ts";
import { tabDrop, useTabDrag } from "./tab-drag.ts";
import { TabletShell, tabletScreen } from "./TabletShell.tsx";
import { newWorkspace, open } from "./workspace.ts";
import { useWorkspace } from "./workspace-store.ts";

let n = 0;
const ids = () => `d-${++n}`;

const ROUTES = {
  _layout: () => <TabletShell stack={<Stack screenLayout={tabletScreen} />} />,
  index: () => null,
  trash: () => null,
  pinned: () => null,
  tasks: () => null,
};

const LANDSCAPE = { width: 1376, height: 1032 };
const groups = () => useWorkspace.getState().ws.layout.groups.map((g) => g.tabs.map((t) => t.view));
const tabId = (view: string) =>
  useWorkspace
    .getState()
    .ws.layout.groups.flatMap((g) => g.tabs)
    .find((t) => t.view === view)?.id ?? "";

async function setup() {
  resetRouterFollower();
  act(() => useWorkspace.setState({ ws: newWorkspace(ids) }));
  const screen = await renderScreens(ROUTES, testData(), "/", LANDSCAPE);
  // Tabs with ids of their own: the store's come from the system, missing in a test.
  act(() => {
    const ws = useWorkspace.getState().ws;
    const trash = open(ws, "/trash", "here", ids);
    useWorkspace.setState({
      ws: open(open(trash, "/pinned", "newTab", ids), "/tasks", "newTab", ids),
    });
  });
  await screen.findByRole("tab", { name: "Tasks" });
  return screen;
}

const drag = (view: string, translationX: number, absoluteX: number, translationY = 0) =>
  act(() => {
    fireGestureHandler(getByGestureTestId(`tab-drag-${tabId(view)}`), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: translationX / 2, absoluteX, translationY },
      { state: State.END, translationX, absoluteX, translationY },
    ]);
  });

describe("where a dragged tab lands", () => {
  const slots = [
    { x: 0, width: 100 },
    { x: 104, width: 150 },
    { x: 258, width: 120 },
  ];
  it("goes where its middle is", () => {
    expect(
      tabDrop({ slots, count: 3, from: 0, dx: 170, dy: 0, x: 400, windowWidth: 1376 }),
    ).toEqual({
      kind: "reorder",
      to: 1,
    });
    expect(
      tabDrop({ slots, count: 3, from: 0, dx: 400, dy: 0, x: 600, windowWidth: 1376 }),
    ).toEqual({
      kind: "reorder",
      to: 2,
    });
    expect(
      tabDrop({ slots, count: 3, from: 2, dx: -400, dy: 0, x: 20, windowWidth: 1376 }),
    ).toEqual({
      kind: "reorder",
      to: 0,
    });
  });

  it("splits at the window's right edge, shows the menu when not moved, and stays put nearby", () => {
    expect(
      tabDrop({ slots, count: 3, from: 1, dx: 1100, dy: 300, x: 1350, windowWidth: 1376 }),
    ).toEqual({
      kind: "right",
    });
    expect(tabDrop({ slots, count: 3, from: 1, dx: 2, dy: 3, x: 180, windowWidth: 1376 })).toEqual({
      kind: "menu",
    });
    expect(tabDrop({ slots, count: 3, from: 1, dx: 30, dy: 3, x: 210, windowWidth: 1376 })).toEqual(
      {
        kind: "none",
      },
    );
  });
});

// 10.3: a tab is held and dragged, as the desktop's tab bar (D86).
describe("dragging a tab", () => {
  it("puts it in a new place in the strip", async () => {
    await setup();
    drag("/trash", 2000, 900);
    await waitFor(() => expect(groups()).toEqual([["/pinned", "/tasks", "/trash"]]));
  });

  it("moves it into a new group on the right when dropped on the window's right edge", async () => {
    await setup();
    drag("/pinned", 1200, LANDSCAPE.width - 10, 400);
    await waitFor(() => expect(groups()).toEqual([["/trash", "/tasks"], ["/pinned"]]));
  });

  it("shows where a tab dropped on the right edge goes while one is dragged", async () => {
    const screen = await setup();
    expect(screen.queryByTestId("split-drop-zone")).toBeNull();
    act(() => useTabDrag.setState({ dragging: true, overEdge: false }));
    expect(screen.getByTestId("split-drop-zone")).toBeTruthy();
    expect(screen.queryByText("Open on the Right")).toBeNull();
    act(() => useTabDrag.setState({ overEdge: true }));
    expect(screen.getByText("Open on the Right")).toBeTruthy();
    act(() => useTabDrag.setState({ dragging: false, overEdge: false }));
    expect(screen.queryByTestId("split-drop-zone")).toBeNull();
  });

  it("opens the tab's menu when lifted and let go in place", async () => {
    const screen = await setup();
    drag("/trash", 0, 40);
    expect(await screen.findByText("Pin Tab")).toBeTruthy();
  });

  it("moves with a screen reader's actions", async () => {
    const screen = await setup();
    fireEvent(screen.getByRole("tab", { name: "Trash" }), "accessibilityAction", {
      nativeEvent: { actionName: "moveRight" },
    });
    await waitFor(() => expect(groups()).toEqual([["/pinned", "/trash", "/tasks"]]));
  });
});
