import { describe, expect, it } from "vitest";
import { platformKeys } from "./platform.ts";

describe("platformKeys", () => {
  it("keeps the Mac symbols on a Mac", () => {
    expect(platformKeys("⇧⌘W", true)).toBe("⇧⌘W");
  });

  it("spells out a lone modifier elsewhere", () => {
    expect(platformKeys("⌘", false)).toBe("Ctrl");
    expect(platformKeys("⇧", false)).toBe("Shift");
    expect(platformKeys("⌥", false)).toBe("Alt");
    expect(platformKeys("⌃", false)).toBe("Ctrl");
  });

  it("joins a combo with plus signs, Ctrl first", () => {
    expect(platformKeys("⌘J", false)).toBe("Ctrl+J");
    expect(platformKeys("⇧⌘W", false)).toBe("Ctrl+Shift+W");
    expect(platformKeys("⇧ Enter", false)).toBe("Shift+Enter");
  });

  it("rewrites shortcuts inside a sentence", () => {
    expect(platformKeys("Press ⌘J anywhere to jot.", false)).toBe("Press Ctrl+J anywhere to jot.");
  });

  it("leaves plain text alone", () => {
    expect(platformKeys("Enter", false)).toBe("Enter");
  });
});
