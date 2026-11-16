import { createPage, createSpace } from "@nookly/shared/data";
import { Stack, router } from "expo-router";
import { act, fireEvent, waitFor, within } from "expo-router/testing-library";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { renderScreens, testData } from "../test/render.tsx";
import { resetRouterFollower } from "./follow-router.ts";
import { ratioAt } from "./SplitDivider.tsx";
import { TabletShell, tabletScreen } from "./TabletShell.tsx";
import { newWorkspace } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

let n = 0;
const ids = () => `t-${++n}`;

/// The routes the router knows; the shell draws the pages itself, so each is empty here.
const ROUTES = {
  _layout: () => <TabletShell stack={<Stack screenLayout={tabletScreen} />} />,
  index: () => null,
  tasks: () => null,
  calendar: () => null,
  trash: () => null,
  pinned: () => null,
  "entity/[id]": () => null,
  "module/[spaceId]/[module]": () => null,
  "new/task": () => null,
  conflicts: () => null,
  "space-settings/[id]": () => null,
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

  it("names where the tab is in the titlebar's crumbs, the last alone in a medium window", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => workspace.open(`/entity/${screen.note}`));
    const crumbs = () => within(screen.getByTestId("crumbs"));
    expect(await crumbs().findByText("Work")).toBeTruthy();
    expect(crumbs().getByRole("link", { name: "Notes" })).toBeTruthy();
    // The note's own crumb, after its Space and module.
    expect(crumbs().getByText("Meeting notes")).toBeTruthy();
    // An item has its details toggle; the search field opens the palette.
    expect(screen.getByRole("button", { name: /Details$/ })).toBeTruthy();
    expect(screen.getByRole("search", { name: "Search" })).toBeTruthy();
  });

  it("keeps a medium window's titlebar to the last crumb and a search button", async () => {
    const screen = await setup(MINI);
    act(() => router.navigate(`/module/${screen.space}/notes`));
    await waitFor(() => expect(groups()).toEqual([[`/module/${screen.space}/notes`]]));
    const crumbs = within(screen.getByTestId("crumbs"));
    expect(await crumbs.findByText("Notes")).toBeTruthy();
    expect(crumbs.queryByText("Work")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Details$/ })).toBeNull();
  });

  it("splits from the titlebar's split button", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => router.navigate("/trash"));
    await waitFor(() => expect(groups()).toEqual([["/trash"]]));
    await fireEvent.press(screen.getByRole("button", { name: "Split" }));
    expect(await screen.findByText("Split Left")).toBeTruthy();
    await fireEvent.press(screen.getByText("Split Right"));
    await waitFor(() => expect(groups()).toEqual([["/trash"], ["/trash"]]));
  });

  it("pins a tab from its menu, shown as an icon first", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => {
      workspace.open("/trash");
      workspace.open("/pinned", "newTab");
      workspace.open("/", "newTab");
    });
    await fireEvent(await screen.findByRole("tab", { name: "Trash" }), "longPress");
    await fireEvent.press(await screen.findByText("Pin Tab"));
    expect(await screen.findByRole("tab", { name: "Trash, pinned" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);
    expect(tabs[0]).toBe("Trash, pinned");
  });

  it("shows one group in a medium window, with a button for the other", async () => {
    const screen = await setup(MINI);
    act(() => {
      workspace.open("/trash");
      workspace.splitRight();
      workspace.open("/pinned");
    });
    expect(await screen.findByRole("button", { name: "Show Left Group" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show Left Group" }));
    expect(await screen.findByRole("button", { name: "Show Right Group" })).toBeTruthy();
  });

  it("splits where the divider is let go, each group keeping 360", () => {
    expect(ratioAt(500, 1000)).toBe(0.5);
    expect(ratioAt(100, 1000)).toBe(0.36);
    expect(ratioAt(990, 1000)).toBe(0.64);
  });

  it("opens an item in place when Open Items Beside the List is off", async () => {
    const screen = await setup(LANDSCAPE);
    await fireEvent.press(screen.getByRole("button", { name: "Split" }));
    await fireEvent.press(await screen.findByText("Open Items Beside the List"));
    // It changes once the menu has gone.
    await waitFor(() => expect(screen.queryByText("Open Items Beside the List")).toBeNull());
    act(() => router.navigate(`/module/${screen.space}/notes`));
    await waitFor(() => expect(groups()).toEqual([[`/module/${screen.space}/notes`]]));
    act(() => router.push(`/entity/${screen.note}`));
    await waitFor(() => expect(groups()).toEqual([[`/entity/${screen.note}`]]));
  });

  it("keeps an item's details beside it where they fit, and slides them over it where not", async () => {
    const wide = await setup(LANDSCAPE);
    act(() => workspace.open(`/entity/${wide.note}`));
    expect(await wide.findByLabelText("Details")).toBeTruthy();
    expect(wide.queryByRole("button", { name: "Close Details" })).toBeNull();
    wide.unmount();

    const narrow = await setup(MINI);
    act(() => workspace.open(`/entity/${narrow.note}`));
    await fireEvent.press(await narrow.findByRole("button", { name: "Show Details" }));
    // The dim behind it closes it (VoiceOver reads only the pane, which is modal).
    const dim = await narrow.findByLabelText("Close Details", { includeHiddenElements: true });
    expect(narrow.getByLabelText("Hide Details", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(dim);
    expect(
      await narrow.findByLabelText("Show Details", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("titles a page without a list header in its own header row, with no system bar", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => workspace.open("/conflicts"));
    expect(await screen.findByRole("header", { name: "Review Changes" })).toBeTruthy();
  });

  // A Space's settings are the desktop's dialog over the window, not a page in a tab (6.12).
  it("opens a Space's settings over the window, leaving the tabs as they were", async () => {
    const screen = await setup(LANDSCAPE);
    act(() => router.push(`/space-settings/${screen.space}`));
    await waitFor(() => expect(screen.getPathname()).toBe(`/space-settings/${screen.space}`));
    expect(groups()).toEqual([["/"]]);
  });

  it("goes back in the tab's history on a swipe from the page's left edge", async () => {
    await setup(LANDSCAPE);
    act(() => workspace.open("/trash"));
    await waitFor(() => expect(groups()).toEqual([["/trash"]]));
    swipeFromEdge(600);
    await waitFor(() => expect(groups()).toEqual([["/"]]));
  });

  it("opens the sidebar on a swipe from the edge with nothing to go back to", async () => {
    const screen = await setup(MINI);
    expect(screen.getByLabelText("Expand Sidebar")).toBeTruthy();
    swipeFromEdge(300);
    expect(
      await screen.findByLabelText("Collapse Sidebar", { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});

const swipeFromEdge = (translationX: number) =>
  act(() => {
    fireGestureHandler(getByGestureTestId("edge-back"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: translationX / 2 },
      { state: State.END, translationX, velocityX: translationX * 3 },
    ]);
  });
