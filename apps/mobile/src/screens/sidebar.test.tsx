import { createSpace, createTask, setPinned } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { Slot } from "expo-router";
import { Text } from "react-native";
import DrawerLayout from "../app/(drawer)/_layout.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import { SidebarDrawer } from "../shell/SidebarDrawer.tsx";
import { Sidebar } from "./Sidebar.tsx";

describe("the sidebar", () => {
  it("lists Pinned and the Spaces, and opens a Space's module", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, work, "Quarterly report");
    await setPinned(data.db, task, true);
    data.driver.rows(
      "INSERT INTO spaces (id, name, color, created_at, updated_at, position) VALUES ('shared-ada', 'Ada', '#ef4444', '', '', 9)",
    );
    const close = jest.fn();
    const screen = await renderScreens(
      {
        index: () => <Sidebar close={close} />,
        "module/[spaceId]/[module]": () => <Text>Module page</Text>,
      },
      data,
    );
    expect(await screen.findByRole("button", { name: "Quarterly report" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ada, Shared with you" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Work" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Tasks in Work" }));
    expect(close).toHaveBeenCalled();
    expect(screen.getPathname()).toBe(`/module/${work}/tasks`);
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
