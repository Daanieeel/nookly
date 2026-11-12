import { createSpace, createTask, createView, markOpened, setPinned } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { Slot } from "expo-router";
import { Text } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import DrawerLayout from "../app/(drawer)/_layout.tsx";
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
    for (const words of [...(await screen.findAllByText("Tasks")), screen.getByText("Search")]) {
      expect(touchesOf(words)).toBe("none");
    }
    expect(touchesOf(screen.getByText(/Week \d+/))).toBe("none");
  });
});

describe("the app's frame", () => {
  it("opens the sidebar from the menu button, which is the whole app's drawer", async () => {
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
    await fireEvent.press(screen.getByLabelText("Open Sidebar"));
    expect(await screen.findByRole("search", { name: "Search" })).toBeTruthy();
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
