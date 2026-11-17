import { act, waitFor } from "expo-router/testing-library";
import { renderScreens } from "../test/render.tsx";
import { type KeySystem, ShortcutHost } from "./ShortcutHost.tsx";
import { useShell } from "./store.ts";
import { pushLayer } from "../ui/sheet/layers.ts";
import { setPageKeys } from "./page-keys.ts";
import { workspace } from "./workspace-store.ts";
import { writePreference } from "../data/preferences.ts";
import type { KeyShortcut } from "../../modules/nookly-keys/src/index.ts";
import { KEY_CHANGES } from "./shortcut-keys.ts";

let listener: ((id: string) => void) | null = null;
const registered: string[][] = [];
const menus: { title: string; ids: string[] }[][] = [];
const given: KeyShortcut[][] = [];

const fakeKeys: KeySystem = {
  setShortcuts: (items) => {
    registered.push(items.map((i) => i.id));
    given.push(items);
  },
  setMenus: (items) => void menus.push(items),
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
    "new/task": () => null,
  });
  return { ...screen, actions };
}

afterEach(() => act(() => useShell.getState().close()));

describe("keyboard shortcuts", () => {
  // As the desktop's New: it creates in the list shown (10.1).
  it("creates in the list the focused tab shows", async () => {
    const screen = await setup();
    act(() => workspace.open("/module/s1/tasks"));
    press("newItem");
    await waitFor(() => expect(screen.getPathname()).toBe("/new/task"));
  });

  // A screen's own keys (a study session's Space and 1 to 4) only while it is shown (9.3).
  it("takes a screen's own keys while it is shown, and gives them back after", async () => {
    await setup();
    const run = jest.fn();
    let stop!: () => void;
    act(() => {
      stop = setPageKeys([{ id: "flip", key: " ", modifiers: [], title: "Show Answer" }], run);
    });
    await waitFor(() => expect(registered.at(-1)).toContain("flip"));
    press("flip");
    expect(run).toHaveBeenCalledWith("flip");
    act(() => stop());
    await waitFor(() => expect(registered.at(-1)).not.toContain("flip"));
  });

  it("tells the system about every shortcut", async () => {
    await setup();
    expect(registered.at(-1)).toEqual(
      expect.arrayContaining(["search", "quickOpen", "commands", "back", "toggleSidebar"]),
    );
  });

  it("take Escape and Command Return only while a popover or dialog is open", async () => {
    await setup();
    expect(registered.at(-1)).not.toContain("dismiss");
    const close = jest.fn();
    const submit = jest.fn();
    let layer!: ReturnType<typeof pushLayer>;
    act(() => {
      layer = pushLayer(close);
      layer.setSubmit(submit);
    });
    await waitFor(() =>
      expect(registered.at(-1)).toEqual(expect.arrayContaining(["dismiss", "submit"])),
    );
    press("submit");
    press("dismiss");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    act(() => layer.remove());
    await waitFor(() => expect(registered.at(-1)).not.toContain("dismiss"));
  });

  // Keys changed in Settings (8.6) are the ones the system is told about; one left without
  // a key is not registered at all.
  it("register the keys changed in Settings", async () => {
    writePreference(KEY_CHANGES, [
      { id: "search", keys: { key: "j", modifiers: ["command", "shift"] } },
      { id: "quickOpen", keys: null },
    ]);
    await setup();
    const search = given.at(-1)?.find((s) => s.id === "search");
    expect(search).toMatchObject({ key: "j", modifiers: ["command", "shift"] });
    expect(registered.at(-1)).not.toContain("quickOpen");
    writePreference(KEY_CHANGES, []);
  });

  it("fill the menu bar with the desktop's menus", async () => {
    await setup();
    expect(menus.at(-1)?.map((m) => m.title)).toEqual(["File", "Edit", "View", "Go", "Window"]);
  });

  it("take the arrow keys only while the newest layer moves a selection", async () => {
    await setup();
    const move = jest.fn();
    let plain!: ReturnType<typeof pushLayer>;
    act(() => {
      plain = pushLayer(() => {});
    });
    await waitFor(() => expect(registered.at(-1)).toContain("dismiss"));
    expect(registered.at(-1)).not.toContain("moveDown");
    let list!: ReturnType<typeof pushLayer>;
    act(() => {
      list = pushLayer(() => {}, { move });
    });
    await waitFor(() =>
      expect(registered.at(-1)).toEqual(expect.arrayContaining(["moveUp", "moveDown"])),
    );
    press("moveDown");
    press("moveUp");
    expect(move.mock.calls).toEqual([[1], [-1]]);
    act(() => {
      list.remove();
      plain.remove();
    });
    await waitFor(() => expect(registered.at(-1)).not.toContain("moveDown"));
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
