import { StyleSheet } from "react-native";
import {
  createSpace,
  createTask,
  createView,
  listSpaces,
  markOpened,
  setPinned,
} from "@nookly/shared/data";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { devHooks } from "../dev/hooks.ts";
import { Slot } from "expo-router";
import { Text } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import DrawerLayout from "../app/(drawer)/_layout.tsx";
import { RecordingMenu } from "../test/menu.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { SidebarDrawer } from "../shell/SidebarDrawer.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { SidebarBesideProvider } from "../ui/pane.tsx";

describe("the sidebar", () => {
  // The blur under "Nookly" faded out in bands of weaker blur, which showed as steps; it is
  // one blur under a mask that fades it smoothly.
  it("fades the header's blur smoothly, one blur under a gradient", async () => {
    const data = testData();
    await createSpace(data.db, "Work", "#3b82f6");
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data);
    expect(await screen.findAllByTestId("header-blur")).toHaveLength(1);
    expect(screen.getByTestId("header-blur-fade")).toBeTruthy();
  });

  // The blur's fade reached past the header over the mascot's card at the top of the list.
  // Unscrolled, it ends where the list starts.
  it("keeps the header's blur off the list until it scrolls under it", async () => {
    const data = testData();
    await createSpace(data.db, "Work", "#3b82f6");
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data);
    const fade = StyleSheet.flatten((await screen.findByTestId("header-blur-fade")).props.style);
    const list = StyleSheet.flatten(screen.getByTestId("sidebar-list").props.contentContainerStyle);
    expect(fade.height).toBeLessThanOrEqual(list.paddingTop);
  });

  // On a tablet the sidebar sits beside the page as the desktop's does: the titlebar over the
  // page has Search, so the sidebar starts with the mascot's card, no name or Search of its own.
  it("leaves its name and Search to the titlebar beside the page", async () => {
    const data = testData();
    await createSpace(data.db, "Work", "#3b82f6");
    const screen = await renderScreens(
      {
        index: () => (
          <SidebarBesideProvider value>
            <Sidebar close={jest.fn()} />
          </SidebarBesideProvider>
        ),
      },
      data,
    );
    expect(await screen.findByText("Work")).toBeTruthy();
    expect(screen.queryByText("Nookly")).toBeNull();
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    expect(screen.queryByTestId("header-blur")).toBeNull();
  });

  it("shows one Space at a time, and the Space switcher at the bottom picks another", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    const home = await createSpace(data.db, "Home", "#22c55e");
    await createTask(data.db, work, "Quarterly report");
    await createTask(data.db, home, "Fix the tap");
    const close = jest.fn();
    const screen = await renderScreens(
      {
        index: () => <Sidebar close={close} />,
        "module/[spaceId]/[module]": () => <Text>Module page</Text>,
      },
      data,
    );
    expect(await screen.findByRole("button", { name: "Tasks in Work" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tasks in Home" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Home" }));
    expect(await screen.findByRole("button", { name: "Tasks in Home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tasks in Work" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Tasks in Home" }));
    expect(close).toHaveBeenCalled();
    await waitFor(() => expect(screen.getPathname()).toBe(`/module/${home}/tasks`));
  });

  // Picking a page felt slow: the drawer only began to close once the new page had been
  // built. It starts closing first; the page follows a frame later.
  it("starts closing before it opens the page", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, work, "Quarterly report");
    const order: string[] = [];
    const screen = await renderScreens(
      {
        index: () => <Sidebar close={() => order.push("close")} />,
        "module/[spaceId]/[module]": () => {
          order.push("page");
          return <Text>Module page</Text>;
        },
      },
      data,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Tasks in Work" }));
    expect(order).toEqual(["close"]);
    expect(await screen.findByText("Module page")).toBeTruthy();
    expect(order[0]).toBe("close");
    expect(screen.getPathname()).toBe(`/module/${work}/tasks`);
  });

  it("orders the Spaces by dragging their icons at the bottom", async () => {
    const data = testData();
    await createSpace(data.db, "Work", "#3b82f6");
    await createSpace(data.db, "Home", "#22c55e");
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data);
    const work = await screen.findByLabelText("Work, drag to reorder");
    await fireEvent(work, "accessibilityAction", { nativeEvent: { actionName: "moveRight" } });
    await waitFor(async () =>
      expect((await listSpaces(data.db)).map((s) => s.name)).toEqual(["Home", "Work"]),
    );
  });

  it("switches Space while a module of another Space is open", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    const home = await createSpace(data.db, "Home", "#22c55e");
    await createTask(data.db, work, "Quarterly report");
    await createTask(data.db, home, "Fix the tap");
    const screen = await renderScreens(
      { "module/[spaceId]/[module]": () => <Sidebar close={jest.fn()} /> },
      data,
      `/module/${work}/tasks`,
    );
    expect(await screen.findByRole("button", { name: "Tasks in Work" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Home" }));
    expect(await screen.findByRole("button", { name: "Tasks in Home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tasks in Work" })).toBeNull();
  });

  // The user's notes: the Spaces that do not fit open in a dialog with a search, every
  // Space in order, and a Space dragged above the line shows in the sidebar.
  it("lists every Space in a dialog with a search, and moves one into the sidebar", async () => {
    const data = testData();
    const names = ["Work", "Home", "Uni", "Club", "Band", "Gym"];
    for (const name of names) await createSpace(data.db, name, "#3b82f6");
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data);
    expect(screen.queryByRole("button", { name: "Gym" })).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "More Spaces" }));
    expect(await screen.findByLabelText("Search Spaces")).toBeTruthy();
    expect(screen.getByText("In the sidebar")).toBeTruthy();
    // The line speaks for itself: no hint under it (the user's notes).
    expect(screen.queryByText(/Drag a Space above the line/)).toBeNull();
    // A screen reader moves Gym up past the line, as a finger drags it.
    for (const place of [4, 3, 2]) {
      await fireEvent(screen.getByLabelText("Gym, drag to reorder"), "accessibilityAction", {
        nativeEvent: { actionName: "moveUp" },
      });
      await waitFor(async () =>
        expect((await listSpaces(data.db)).map((s) => s.name).indexOf("Gym")).toBe(place),
      );
      // The dialog's rows are the last six (the switcher's icons come first).
      await waitFor(() =>
        expect(
          screen.getAllByLabelText(/drag to reorder/).slice(-6)[place].props.accessibilityLabel,
        ).toBe("Gym, drag to reorder"),
      );
    }
    // Searching narrows the list; a tap picks that Space.
    await fireEvent.changeText(screen.getByLabelText("Search Spaces"), "clu");
    await fireEvent.press(await screen.findByRole("button", { name: "Club" }));
    expect(await screen.findByRole("header", { name: "Club" })).toBeTruthy();
  });

  it("opens New and a Space's menu as dialogs, its dots a finger's size", async () => {
    const data = testData();
    await createSpace(data.db, "Work", "#3b82f6");
    const menu = new RecordingMenu();
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data, "/", {
      menu,
    });
    await fireEvent.press(await screen.findByRole("button", { name: "New" }));
    expect(menu.presentation).toBe("card");
    const dots = await screen.findByRole("button", { name: "Work Menu" });
    expect(StyleSheet.flatten(dots.props.style).width).toBeGreaterThanOrEqual(44);
    await fireEvent.press(dots);
    expect(menu.presentation).toBe("card");
    expect(menu.labels()).toEqual(["Add Module", "Space Settings"]);
  });

  it("has Nookly's name as its header, with Search as a button beside it", async () => {
    const data = testData();
    const close = jest.fn();
    const screen = await renderScreens(
      { index: () => <Sidebar close={close} />, search: () => <Text>Search page</Text> },
      data,
    );
    expect(await screen.findByRole("header", { name: "Nookly" })).toBeTruthy();
    // The header's button replaces the old Search row.
    expect(screen.queryByRole("search")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    expect(close).toHaveBeenCalled();
    await waitFor(() => expect(screen.getPathname()).toBe("/search"));
  });

  it("says a shared Space is shared, and leaves pinned items to Pinned, as the desktop does", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, work, "Quarterly report");
    await setPinned(data.db, task, true);
    data.driver.rows(
      "INSERT INTO spaces (id, name, color, created_at, updated_at, position) VALUES ('shared-ada', 'Ada', '#ef4444', '', '', 9)",
    );
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data);
    expect(await screen.findByRole("button", { name: "Ada, Shared with you" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pinned" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Quarterly report" })).toBeNull();
  });
});

describe("the sidebar's sections", () => {
  it("has no Recents, as the desktop's sidebar has none", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, work, "Opened lately");
    await markOpened(data.db, task);
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data);
    expect(await screen.findByRole("button", { name: "Work" })).toBeTruthy();
    expect(screen.queryByText("Recents")).toBeNull();
    expect(screen.queryByRole("button", { name: "Opened lately" })).toBeNull();
  });
});

/// The nearest ancestor of an element that says how it takes touches.
function touchesOf(element: ReactTestInstance | null): string | undefined {
  for (let node = element; node; node = node.parent) {
    const touches: string | undefined = node.props.pointerEvents;
    if (touches) return touches;
  }
  return undefined;
}

describe("the text of the sidebar's buttons", () => {
  // A press that lands on the words themselves must reach the row (as the icon buttons
  // already do), so the words never take the touch.
  it("lets a press through to the row", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, work, "Report");
    const screen = await renderScreens({ index: () => <Sidebar close={() => {}} /> }, data);
    for (const words of await screen.findAllByText("Tasks")) {
      expect(touchesOf(words)).toBe("none");
    }
    expect(touchesOf(screen.getByText(/Week \d+/))).toBe("none");
  });
});

describe("the app's frame", () => {
  // The menu button is the system bar's own (`barButton`), outside the tree a test renders;
  // it calls the drawer's `open`, which the dev hook reaches the same way.
  it("opens the sidebar, the whole app's drawer, from any top level page", async () => {
    const screen = await renderScreens({
      _layout: () => (
        <SidebarDrawer enabled edgeBack={false}>
          <Slot />
        </SidebarDrawer>
      ),
      "(drawer)/_layout": DrawerLayout,
      "(drawer)/index": () => <Text>Home</Text>,
    });
    expect(await screen.findByText("Home")).toBeTruthy();
    act(() => devHooks.openSidebar?.());
    expect(await screen.findByRole("header", { name: "Nookly" })).toBeTruthy();
  });
});

describe("the sidebar's card and views", () => {
  it("says the date and week and one thing that waits, and opens its list", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, work, "Late", "2000-01-01");
    const screen = await renderScreens(
      { index: () => <Sidebar close={() => {}} />, tasks: () => <Text>Tasks page</Text> },
      data,
    );
    expect(await screen.findByText(/Week \d+/)).toBeTruthy();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Today, 1 task due or overdue" }),
    );
    expect(await screen.findByText("Tasks page")).toBeTruthy();
  });

  it("unfolds the saved views under Tasks", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await createView(data.db, work, { title: "Open work", module: "tasks-overview", config: "{}" });
    const screen = await renderScreens({ index: () => <Sidebar close={() => {}} /> }, data);
    const toggles = await screen.findAllByRole("button", { name: "Show Task Views" });
    await fireEvent.press(toggles[toggles.length - 1]);
    expect(await screen.findByRole("button", { name: "Open work, saved view" })).toBeTruthy();
  });
});
