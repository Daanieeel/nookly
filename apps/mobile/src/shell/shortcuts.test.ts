import { SHORTCUTS, shortcutLabel } from "./shortcuts.ts";

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
  });
});
