import { describe, expect, it } from "vitest";
import { HIGHLIGHT_COLORS, highlightCss } from "./highlight-colors.ts";

describe("highlight colors", () => {
  it("paints every color the desktop names, in the light theme", () => {
    const css = highlightCss(".pm", false);
    expect(css).toContain(".pm mark { --mark-bg: #fef08a;");
    for (const [id, background] of [
      ["green", "#bbf7d0"],
      ["blue", "#bfdbfe"],
      ["pink", "#fbcfe8"],
      ["orange", "#fed7aa"],
      ["purple", "#ddd6fe"],
    ]) {
      expect(css).toContain(`.pm mark[data-color="${id}"] { --mark-bg: ${background}; }`);
    }
    // Dark text on the light marker.
    expect(css).toContain("color: #1c1917");
  });

  it("dims them in the dark theme and keeps the text color", () => {
    const css = highlightCss(".pm", true);
    expect(css).toContain("--mark-bg: color-mix(in oklab, #facc15 38%, transparent)");
    expect(css).toContain('mark[data-color="green"] { --mark-bg: color-mix(in oklab, #4ade80 34%');
    expect(css).toContain("color: inherit");
  });

  it("has a look for every color it offers", () => {
    for (const color of HIGHLIGHT_COLORS) {
      expect(highlightCss(".pm", false)).toContain(
        color.id === "yellow" ? ".pm mark {" : `mark[data-color="${color.id}"]`,
      );
    }
  });
});
