import { describe, expect, it, vi } from "vitest";
import { HOTKEYS } from "./hotkeys.ts";
import {
  FIXED_SHORTCUTS,
  SHORTCUT_META,
  SHORTCUT_NAMES,
  type ShortcutName,
  checkBinding,
  displayParts,
  displayText,
  findConflict,
  hotkeyFromEvent,
  keySynonyms,
  resolveShortcuts,
  scopesOverlap,
} from "./shortcuts.ts";

function key(init: Partial<KeyboardEventInit> & { key: string; code?: string }) {
  return new KeyboardEvent("keydown", init);
}

describe("shortcut metadata", () => {
  it("describes every entry of HOTKEYS and nothing else", () => {
    expect(Object.keys(SHORTCUT_META).sort()).toEqual(Object.keys(HOTKEYS).sort());
    expect([...SHORTCUT_NAMES].sort()).toEqual(Object.keys(HOTKEYS).sort());
  });

  it("gives every shortcut a title, description, synonyms, section and scope", () => {
    for (const name of SHORTCUT_NAMES) {
      const meta = SHORTCUT_META[name];
      expect(meta.title, name).not.toBe("");
      expect(meta.description, name).not.toBe("");
      expect(meta.synonyms.length, name).toBeGreaterThan(0);
      expect(meta.section, name).not.toBe("");
      expect(meta.scopes.length, name).toBeGreaterThan(0);
    }
  });

  it("ships defaults that never clash with each other or with a fixed shortcut", () => {
    expect(resolveShortcuts({})).toEqual(HOTKEYS);
    for (const name of SHORTCUT_NAMES) {
      expect(findConflict(resolveShortcuts({}), name, HOTKEYS[name]), name).toBeNull();
    }
  });
});

describe("the effective shortcut map", () => {
  it("is exactly the current HOTKEYS when nothing is customised", () => {
    expect(resolveShortcuts({})).toEqual({ ...HOTKEYS });
  });

  it("uses an override in place of the default", () => {
    expect(resolveShortcuts({ search: "Mod+Shift+K" }).search).toBe("Mod+Shift+K");
  });

  it("keeps a null override unassigned, which is not the default", () => {
    const map = resolveShortcuts({ search: null });
    expect(map.search).toBeNull();
    expect(map.quickSwitcher).toBe("Mod+P");
  });

  it("lets the same key serve shortcuts whose scopes do not overlap", () => {
    // Previous task (task detail) and Today (calendar) never share a screen.
    const map = resolveShortcuts({ today: "J" });
    expect(map.today).toBe("J");
    expect(map.nextTask).toBe("J");
  });

  it("treats global as overlapping everything", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const map = resolveShortcuts({ today: "Mod+K" });
    expect(map.today).toBe("Mod+K");
    expect(map.search).toBeNull();
    warn.mockRestore();
  });

  it("keeps the explicit override and unassigns the default holder of a duplicate", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const map = resolveShortcuts({ quickJot: "Mod+K" });
    expect(map.quickJot).toBe("Mod+K");
    expect(map.search).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("unassigns all but the first of several overrides on the same key, logging once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const overrides = { newTab: "Mod+U", closeTab: "Mod+U", closeOtherTabs: "Mod+U" };
    const map = resolveShortcuts(overrides);
    expect([map.newTab, map.closeTab, map.closeOtherTabs]).toEqual(["Mod+U", null, null]);
    const calls = warn.mock.calls.length;
    resolveShortcuts(overrides);
    expect(warn.mock.calls.length).toBe(calls);
    warn.mockRestore();
  });

  it("compares keys by what they mean, not how they are spelled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const map = resolveShortcuts({ quickJot: "Shift+Mod+P" });
    expect(map.commands).toBeNull();
    warn.mockRestore();
  });

  it("unassigns a shortcut stored on a key a fixed shortcut owns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveShortcuts({ search: "Mod+C" }).search).toBeNull();
    warn.mockRestore();
  });

  it("never leaves two active shortcuts on one key in overlapping scopes", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const overrides = Object.fromEntries(SHORTCUT_NAMES.map((n) => [n, "Mod+U"]));
    const map = resolveShortcuts(overrides);
    expect(Object.values(map).filter((v) => v !== null)).toHaveLength(1);
    warn.mockRestore();
  });
});

describe("scopes", () => {
  it("overlap when equal or when either is global", () => {
    expect(scopesOverlap(["calendar"], ["calendar"])).toBe(true);
    expect(scopesOverlap(["calendar"], ["task"])).toBe(false);
    expect(scopesOverlap(["global"], ["task"])).toBe(true);
    expect(scopesOverlap(["lists", "calendar"], ["calendar"])).toBe(true);
  });
});

describe("conflicts", () => {
  it("names the other shortcut that has the key", () => {
    expect(findConflict(resolveShortcuts({}), "quickJot", "Mod+K")).toEqual({
      kind: "shortcut",
      name: "search",
    });
  });

  it("finds a clash with a fixed shortcut", () => {
    const conflict = findConflict(resolveShortcuts({}), "search", "Mod+C");
    expect(conflict?.kind).toBe("fixed");
  });

  it("ignores the shortcut itself and unassigned ones", () => {
    const map = resolveShortcuts({ search: null });
    expect(findConflict(map, "quickJot", "Mod+K")).toBeNull();
    expect(findConflict(resolveShortcuts({}), "search", "Mod+K")).toBeNull();
  });

  it("only clashes within overlapping scopes", () => {
    expect(findConflict(resolveShortcuts({}), "today", "J")).toBeNull();
    expect(findConflict(resolveShortcuts({}), "nextTask", "T")).toBeNull();
  });
});

describe("what a binding may be", () => {
  it("needs a modifier unless the default is a bare key", () => {
    expect(checkBinding("search", "K").ok).toBe(false);
    expect(checkBinding("search", "Shift+K").ok).toBe(false);
    expect(checkBinding("search", "Alt+K").ok).toBe(true);
    expect(checkBinding("search", "Mod+Shift+K").ok).toBe(true);
    expect(checkBinding("today", "G").ok).toBe(true);
    expect(checkBinding("today", "Shift+G").ok).toBe(true);
  });

  it("rejects what TanStack cannot parse", () => {
    expect(checkBinding("search", "").ok).toBe(false);
    expect(checkBinding("search", "Mod+Nonsense").ok).toBe(false);
  });
});

describe("recording a key press", () => {
  it("turns Cmd into Mod on a Mac", () => {
    expect(hotkeyFromEvent(key({ key: "k", code: "KeyK", metaKey: true }), true)).toBe("Mod+K");
  });

  it("turns Ctrl into Mod elsewhere", () => {
    expect(hotkeyFromEvent(key({ key: "k", code: "KeyK", ctrlKey: true }), false)).toBe("Mod+K");
  });

  it("keeps Control as Control on a Mac", () => {
    expect(hotkeyFromEvent(key({ key: "k", code: "KeyK", ctrlKey: true }), true)).toBe("Control+K");
  });

  it("orders several modifiers canonically", () => {
    expect(
      hotkeyFromEvent(
        key({ key: "P", code: "KeyP", metaKey: true, shiftKey: true, altKey: true }),
        true,
      ),
    ).toBe("Mod+Alt+Shift+P");
  });

  it("ignores a bare modifier", () => {
    expect(
      hotkeyFromEvent(key({ key: "Shift", code: "ShiftLeft", shiftKey: true }), true),
    ).toBeNull();
    expect(hotkeyFromEvent(key({ key: "Meta", code: "MetaLeft", metaKey: true }), true)).toBeNull();
    expect(
      hotkeyFromEvent(key({ key: "Control", code: "ControlLeft", ctrlKey: true }), false),
    ).toBeNull();
  });

  it("records a bare key and named keys", () => {
    expect(hotkeyFromEvent(key({ key: "g", code: "KeyG" }), false)).toBe("G");
    expect(hotkeyFromEvent(key({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }), false)).toBe(
      "Alt+ArrowLeft",
    );
  });
});

describe("showing a key", () => {
  it("uses symbols on a Mac and words elsewhere", () => {
    expect(displayParts("Mod+Shift+P", true)).toEqual(["⇧", "⌘", "P"]);
    expect(displayParts("Mod+Shift+P", false)).toEqual(["Ctrl", "Shift", "P"]);
    expect(displayText("Mod+Shift+P", true)).toBe("⇧⌘P");
    expect(displayText("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
    expect(displayText("Mod+,", false)).toBe("Ctrl+,");
  });

  it("offers search words for a key, in both Mac and other spellings", () => {
    const words = keySynonyms("Mod+Shift+P");
    expect(words).toContain("cmd shift p");
    expect(words).toContain("ctrl shift p");
    expect(words).toContain("command shift p");
    expect(keySynonyms(null)).toEqual(["not set", "unassigned", "no shortcut"]);
  });
});

describe("fixed shortcuts", () => {
  it("are listed with a label and keys", () => {
    expect(FIXED_SHORTCUTS.length).toBeGreaterThan(0);
    for (const fixed of FIXED_SHORTCUTS) {
      expect(fixed.label).not.toBe("");
      expect(fixed.keys.length).toBeGreaterThan(0);
    }
  });

  it("cannot be taken by a default", () => {
    const names: ShortcutName[] = [...SHORTCUT_NAMES];
    expect(names.every((n) => findConflict({ ...HOTKEYS }, n, HOTKEYS[n]) === null)).toBe(true);
  });
});
