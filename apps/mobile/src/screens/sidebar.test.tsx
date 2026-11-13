import { createSpace, createTask, createView, markOpened, setPinned } from "@nookly/shared/data";
import { act, fireEvent } from "expo-router/testing-library";
import { devHooks } from "../dev/hooks.ts";
import { Slot } from "expo-router";
import { Text } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import DrawerLayout from "../app/(drawer)/_layout.tsx";
import { RecordingMenu } from "../test/menu.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { SidebarDrawer } from "../shell/SidebarDrawer.tsx";
import { Sidebar } from "./Sidebar.tsx";

describe("the sidebar", () => {
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
    expect(screen.getPathname()).toBe(`/module/${home}/tasks`);
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

  it("lists the Spaces that do not fit with their icons and colours", async () => {
    const data = testData();
    const names = ["Work", "Home", "Uni", "Club", "Band", "Gym"];
    for (const name of names) await createSpace(data.db, name, "#3b82f6");
    const menu = new RecordingMenu();
    const screen = await renderScreens({ index: () => <Sidebar close={jest.fn()} /> }, data, "/", {
      menu,
    });
    await fireEvent.press(await screen.findByRole("button", { name: "More Spaces" }));
    expect(menu.items().length).toBeGreaterThan(0);
    for (const item of menu.items()) expect(item.leading).toBeTruthy();
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
    expect(screen.getPathname()).toBe("/search");
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
