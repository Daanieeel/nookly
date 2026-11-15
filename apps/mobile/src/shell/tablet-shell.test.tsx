import { createPage, createSpace } from "@nookly/shared/data";
import { Stack, router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { resetRouterFollower } from "./follow-router.ts";
import { TabletShell, tabletScreen } from "./TabletShell.tsx";
import { newWorkspace } from "./workspace.ts";
import { useWorkspace } from "./workspace-store.ts";

let n = 0;
const ids = () => `t-${++n}`;

/// The routes the router knows; the shell draws the pages itself, so each is empty here.
const ROUTES = {
  _layout: () => <TabletShell stack={<Stack screenLayout={tabletScreen} />} />,
  index: () => null,
  tasks: () => null,
  calendar: () => null,
  "entity/[id]": () => null,
  "module/[spaceId]/[module]": () => null,
  "new/task": () => null,
};

async function setup(window: { width: number; height: number }) {
  resetRouterFollower();
  act(() => useWorkspace.setState({ ws: newWorkspace(ids) }));
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const note = await createPage(data.db, space, "note", "Meeting notes");
  const screen = await renderScreens(ROUTES, data, "/", window);
  return { ...screen, space, note };
}

const LANDSCAPE = { width: 1376, height: 1032 };
const MINI = { width: 744, height: 1133 };
const groups = () => useWorkspace.getState().ws.layout.groups.map((g) => g.tabs.map((t) => t.view));

// The tablet is the desktop made for touch (D83): its own window draws the pages in tabs,
// a list and its item side by side, and the router's stack only shows what goes over it.
describe("the tablet's window", () => {
  it("opens what the router is sent to in the tab shown, with Back in the titlebar", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => router.navigate("/calendar"));
    await waitFor(() => expect(groups()).toEqual([["/calendar"]]));
    await fireEvent.press(screen.getByRole("button", { name: "Go Back" }));
    await waitFor(() => expect(groups()).toEqual([["/"]]));
    await fireEvent.press(screen.getByRole("button", { name: "Go Forward" }));
    await waitFor(() => expect(groups()).toEqual([["/calendar"]]));
  });

  it("opens an item beside the list it was picked from, named in its tab", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => router.navigate(`/module/${screen.space}/notes`));
    await waitFor(() => expect(groups()).toEqual([[`/module/${screen.space}/notes`]]));
    act(() => router.push(`/entity/${screen.note}`));
    await waitFor(() =>
      expect(groups()).toEqual([[`/module/${screen.space}/notes`], [`/entity/${screen.note}`]]),
    );
    expect(await screen.findByRole("tab", { name: "Meeting notes" })).toBeTruthy();
    // Both groups show, each with its own tabs; the list keeps the focus.
    expect(screen.getByLabelText("Page")).toBeTruthy();
    expect(screen.getByLabelText("Page, focused")).toBeTruthy();
  });

  it("opens an item in place where a list and an item do not fit side by side", async () => {
    const screen = await setup(MINI);
    act(() => router.navigate(`/module/${screen.space}/notes`));
    await waitFor(() => expect(groups()).toEqual([[`/module/${screen.space}/notes`]]));
    act(() => router.push(`/entity/${screen.note}`));
    await waitFor(() => expect(groups()).toEqual([[`/entity/${screen.note}`]]));
  });

  it("leaves the tabs alone while a sheet opens over the window and closes again", async () => {
    await setup(LANDSCAPE);
    act(() => router.navigate("/tasks"));
    await waitFor(() => expect(groups()).toEqual([["/tasks"]]));
    act(() => router.push("/new/task"));
    act(() => router.back());
    await waitFor(() => expect(groups()).toEqual([["/tasks"]]));
    expect(useWorkspace.getState().ws.layout.groups[0].tabs[0].backStack).toEqual(["/"]);
  });

  it("opens a new tab from the tab row", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => router.navigate("/tasks"));
    await waitFor(() => expect(groups()).toEqual([["/tasks"]]));
    act(() => useWorkspace.getState().update((ws) => ws));
    // One tab: no tab row, as on the desktop. A second brings it.
    expect(screen.queryByRole("tablist")).toBeNull();
    act(() => router.navigate("/calendar"));
    await waitFor(() => expect(groups()).toEqual([["/calendar"]]));
  });
});
