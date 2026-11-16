import { HOTKEYS } from "@nookly/frontend/lib/hotkeys";
import { MENUS, SHORTCUTS, shortcutLabel } from "./shortcuts.ts";

describe("the keyboard shortcuts", () => {
  it("never give two actions the same keys", () => {
    const seen = new Set<string>();
    for (const s of SHORTCUTS) {
      const keys = `${[...s.modifiers].sort().join("+")}+${s.key}`;
      expect(seen.has(keys)).toBe(false);
      seen.add(keys);
    }
  });

  it("have unique ids and titles", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(new Set(SHORTCUTS.map((s) => s.title)).size).toBe(SHORTCUTS.length);
  });

  it("are written as the system writes them", () => {
    const by = (id: string) => {
      const s = SHORTCUTS.find((x) => x.id === id);
      if (!s) throw new Error(id);
      return shortcutLabel(s);
    };
    expect(by("search")).toBe("⌘K");
    expect(by("commands")).toBe("⇧⌘P");
    expect(by("back")).toBe("⌘[");
  });

  it("keep the desktop's keys for what both have", () => {
    const keysOf = (id: string) => {
      const s = SHORTCUTS.find((x) => x.id === id);
      return s ? shortcutLabel(s) : null;
    };
    expect(keysOf("quickOpen")).toBe("⌘P");
    expect(keysOf("settings")).toBe("⌘,");
    expect(keysOf("toggleSidebar")).toBe("⌘S");
    expect(keysOf("quickJot")).toBe("⌘J");
    expect(keysOf("closeOtherTabs")).toBe("⇧⌘W");
    expect(keysOf("nextTabAlt")).toBe("⌥⌘→");
    expect(keysOf("splitRight")).toBe("⌥⇧⌘→");
    expect(keysOf("splitLeft")).toBe("⌥⇧⌘←");
    expect(keysOf("focusLeftGroup")).toBe("⌘1");
    expect(keysOf("toggleGroupZoom")).toBe("⇧⌘↩");
  });

  it("are each listed once in the menu bar, under the desktop's menus", () => {
    const listed = MENUS.flatMap((m) => m.ids);
    expect([...listed].sort()).toEqual(SHORTCUTS.map((s) => s.id).sort());
    expect(MENUS.map((m) => m.title)).toEqual(["File", "Edit", "View", "Go", "Window"]);
  });
});

// Every shortcut the tablet shares with the desktop has the desktop's keys, read from its
// own key map (`packages/frontend/src/lib/hotkeys.ts`), so the two can't drift (10.1).
describe("the tablet's shortcuts against the desktop's", () => {
  const DESKTOP_ID: Record<string, string> = {
    quickOpen: "quickSwitcher",
    toggleInspector: "toggleDetailSidebar",
    find: "findInPage",
  };
  const MODS: Record<string, string> = {
    Mod: "command",
    Alt: "option",
    Shift: "shift",
    Control: "control",
  };
  const KEYS: Record<string, string> = {
    ArrowLeft: "UIKeyInputLeftArrow",
    ArrowRight: "UIKeyInputRightArrow",
    ArrowUp: "UIKeyInputUpArrow",
    ArrowDown: "UIKeyInputDownArrow",
    Enter: "\r",
    Tab: "\t",
  };
  /// "Mod+Alt+ArrowRight" as the tablet writes it.
  const tabletKeys = (desktop: string) => {
    const parts = desktop.split("+");
    const key = parts.pop() ?? "";
    return {
      key: KEYS[key] ?? key.toLowerCase(),
      modifiers: parts.map((m) => MODS[m]).sort(),
    };
  };

  it("uses the desktop's keys for every action both have", () => {
    for (const s of SHORTCUTS) {
      const desktop = HOTKEYS[(DESKTOP_ID[s.id] ?? s.id) as keyof typeof HOTKEYS];
      if (!desktop) continue;
      expect({ id: s.id, ...tabletKeys(String(desktop)) }).toEqual({
        id: s.id,
        key: s.key,
        modifiers: [...s.modifiers].sort(),
      });
    }
  });

  it("has the desktop's ways to create that a tablet can use", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["newTask", "quickAssignment", "import"]));
  });
});
