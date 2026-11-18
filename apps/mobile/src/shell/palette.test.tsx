import { createPage, createSpace, createTask, markOpened } from "@nookly/shared/data";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { useShell } from "./store.ts";
import { topLayer } from "../ui/sheet/layers.ts";

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const task = await createTask(data.db, space, "Buy milk");
  const page = await createPage(data.db, space, "note", "Milk and honey notes");
  await markOpened(data.db, page);
  const actions: string[] = [];
  const screen = await renderScreens(
    {
      index: () => <CommandPalette onAction={(action) => actions.push(action)} />,
      "entity/[id]": () => null,
      tasks: () => null,
      calendar: () => null,
      search: () => null,
    },
    data,
  );
  return { ...screen, space, task, page, actions };
}

afterEach(() => act(() => useShell.getState().close()));

describe("the command palette", () => {
  it("stays out of the way until it is asked for", async () => {
    const { queryByLabelText } = await setup();
    expect(queryByLabelText("Search everything")).toBeNull();
  });

  it("finds an item by its title and opens it", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("search"));
    fireEvent.changeText(await screen.findByLabelText("Search everything"), "milk");
    await fireEvent.press(await screen.findByRole("button", { name: /^Buy milk, TSK-1/ }));
    await waitFor(() => expect(screen.getPathname()).toBe(`/entity/${screen.task}`));
    expect(useShell.getState().palette).toBeNull();
  });

  it("opens the first match when return is pressed", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("commands"));
    const input = await screen.findByLabelText("Search everything");
    fireEvent.changeText(input, "go to tasks");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getPathname()).toBe("/tasks"));
  });

  it("hands app actions to whoever shows it", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("commands"));
    fireEvent.changeText(await screen.findByLabelText("Search everything"), "collapse sidebar");
    await fireEvent.press(
      await screen.findByRole("button", { name: /^Collapse or Expand the Sidebar/ }),
    );
    expect(screen.actions).toEqual(["toggleSidebar"]);
  });

  it("starts with recent items in quick open and commands in the command list", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("quick"));
    expect(await screen.findByRole("button", { name: /^Milk and honey notes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^New Task/ })).toBeNull();
    act(() => useShell.getState().open("commands"));
    expect(await screen.findByRole("button", { name: /^New Task/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Milk and honey notes/ })).toBeNull();
  });

  it("moves its selection with the arrow keys and opens it with Return", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("commands"));
    const input = await screen.findByLabelText("Search everything");
    fireEvent.changeText(input, "go to");
    await screen.findByRole("button", { name: /^Go to Tasks/ });
    const selected = () =>
      screen
        .getAllByRole("button", { name: /^Go to/ })
        .map((b) => b.props.accessibilityState?.selected === true);
    expect(selected().slice(0, 2)).toEqual([true, false]);
    act(() => topLayer()?.move?.(1));
    act(() => topLayer()?.move?.(1));
    expect(selected().slice(0, 3)).toEqual([false, false, true]);
    act(() => topLayer()?.move?.(-1));
    const second = screen.getAllByRole("button", { name: /^Go to/ })[1];
    expect(second.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getPathname()).toBe("/calendar"));
  });

  it("closes with Escape", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("search"));
    await screen.findByLabelText("Search everything");
    act(() => topLayer()?.close());
    expect(useShell.getState().palette).toBeNull();
    expect(topLayer()).toBeUndefined();
  });

  it("shows every result of a search on the Search page", async () => {
    const screen = await setup();
    act(() => useShell.getState().open("search"));
    fireEvent.changeText(await screen.findByLabelText("Search everything"), "milk");
    await fireEvent.press(await screen.findByRole("button", { name: "Show All Results" }));
    await waitFor(() => expect(screen.getPathname()).toBe("/search"));
    expect(screen.getSearchParams()).toMatchObject({ q: "milk" });
    expect(useShell.getState().palette).toBeNull();
  });
});
