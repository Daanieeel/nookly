import { describe, expect, it } from "vitest";
import { localizeShortcuts } from "./shortcut-text.ts";

describe("localizeShortcuts", () => {
  it("writes a shortcut in code the way the system does, symbols on a Mac", () => {
    expect(localizeShortcuts("Press `Mod+Shift+J` now.", true)).toBe("Press `⇧⌘J` now.");
  });

  it("spells the same shortcut out elsewhere", () => {
    expect(localizeShortcuts("Press `Mod+Shift+J` now.", false)).toBe("Press `Ctrl+Shift+J` now.");
  });

  it("reads Cmd and Ctrl as the main modifier, and Option as Alt", () => {
    expect(localizeShortcuts("`Cmd+K` and `Ctrl+P` and `Option+Left`", false)).toBe(
      "`Ctrl+K` and `Ctrl+P` and `Alt+ArrowLeft`".replace("ArrowLeft", "←"),
    );
  });

  it("leaves other code and plain text alone", () => {
    const text = "Run `nookly cli schema`, a `+` sign, `a+b` and Mod+Shift+J in plain words.";
    expect(localizeShortcuts(text, true)).toBe(text);
  });

  it("changes every shortcut in a line", () => {
    expect(localizeShortcuts("`Mod+I` or `Mod+Shift+V`", true)).toBe("`⌘I` or `⇧⌘V`");
  });

  it("keeps a lone key as it is", () => {
    expect(localizeShortcuts("Press `Tab`.", true)).toBe("Press `Tab`.");
  });
});
