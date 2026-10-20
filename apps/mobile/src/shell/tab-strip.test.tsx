import { createPage, createSpace } from "@nookly/shared/data";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { TabStrip } from "./TabStrip.tsx";
import { startTabs } from "./tabs.ts";
import { tabActions, useTabs } from "./tabs-store.ts";

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const page = await createPage(data.db, space, "note", "Meeting notes");
  act(() => useTabs.setState({ state: startTabs(() => "first") }));
  const screen = await renderScreens(
    { index: () => <TabStrip />, tasks: () => null, "entity/[id]": () => null },
    data,
  );
  return { ...screen, page };
}

describe("the tab strip", () => {
  it("names the tab by its page, the item's own title for an item", async () => {
    const screen = await setup();
    expect(await screen.findByRole("tab", { name: "Dashboard" })).toBeTruthy();
    act(() => {
      tabActions.open();
      tabActions.visit(`/entity/${screen.page}`);
    });
    expect(await screen.findByRole("tab", { name: "Meeting notes" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeTruthy();
  });

  it("opens a new tab on the dashboard, and goes back to another when it is chosen", async () => {
    const screen = await setup();
    act(() => tabActions.visit("/tasks"));
    await fireEvent.press(await screen.findByRole("button", { name: "New Tab" }));
    await waitFor(() => expect(useTabs.getState().state.tabs).toHaveLength(2));
    await waitFor(() => expect(screen.getPathname()).toBe("/"));
    await fireEvent.press(screen.getByRole("tab", { name: "Tasks" }));
    await waitFor(() => expect(screen.getPathname()).toBe("/tasks"));
  });

  it("closes a tab and shows the one beside it", async () => {
    const screen = await setup();
    act(() => tabActions.visit("/tasks"));
    await fireEvent.press(await screen.findByRole("button", { name: "New Tab" }));
    await waitFor(() => expect(useTabs.getState().state.tabs).toHaveLength(2));
    await fireEvent.press(screen.getByRole("button", { name: "Close Dashboard" }));
    await waitFor(() => expect(useTabs.getState().state.tabs).toHaveLength(1));
    await waitFor(() => expect(screen.getPathname()).toBe("/tasks"));
  });
});
