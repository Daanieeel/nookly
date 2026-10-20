import { act, waitFor } from "expo-router/testing-library";
import { renderScreens } from "../test/render.tsx";
import { type KeySystem, ShortcutHost } from "./ShortcutHost.tsx";
import { useShell } from "./store.ts";

let listener: ((id: string) => void) | null = null;
const registered: string[][] = [];

const fakeKeys: KeySystem = {
  setShortcuts: (items) => void registered.push(items.map((i) => i.id)),
  onShortcut: (fn) => {
    listener = fn;
    return () => {
      listener = null;
    };
  },
};

const press = (id: string) => act(() => listener?.(id));

async function setup() {
  const actions: string[] = [];
  const screen = await renderScreens({
    index: () => <ShortcutHost keys={fakeKeys} onAction={(action) => actions.push(action)} />,
    settings: () => null,
    "new/jot": () => null,
  });
  return { ...screen, actions };
}

afterEach(() => act(() => useShell.getState().close()));

describe("keyboard shortcuts", () => {
  it("tells the system about every shortcut", async () => {
    await setup();
    expect(registered.at(-1)).toEqual(
      expect.arrayContaining(["search", "quickOpen", "commands", "back", "toggleSidebar"]),
    );
  });

  it("open the palette in the mode they are named for", async () => {
    await setup();
    press("search");
    expect(useShell.getState().palette).toBe("search");
    press("quickOpen");
    expect(useShell.getState().palette).toBe("quick");
    press("commands");
    expect(useShell.getState().palette).toBe("commands");
  });

  it("open pages and sheets", async () => {
    const screen = await setup();
    press("settings");
    await waitFor(() => expect(screen.getPathname()).toBe("/settings"));
  });

  it("hand what only the window can do to the window", async () => {
    const screen = await setup();
    press("toggleSidebar");
    press("back");
    expect(screen.actions).toEqual(["toggleSidebar", "back"]);
  });

  it("stop listening when the window goes", async () => {
    const screen = await setup();
    screen.unmount();
    expect(listener).toBeNull();
  });
});
