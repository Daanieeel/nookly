import { PAGE_FONTS } from "@nookly/shared/page-typography";
import { PLACEHOLDER_CSS, pageTypographyCss, placeholderStyle } from "./typography.ts";

describe("a page's font and size on the phone", () => {
  it("leaves the phone's own font at the default size", () => {
    expect(pageTypographyCss("default", 14)).toBe(":root { --page-scale: 1; }");
  });

  it("follows the font and size chosen in Settings, as the desktop does", () => {
    const css = pageTypographyCss("serif", 21);
    expect(css).toContain(`--page-font: ${PAGE_FONTS.serif};`);
    expect(css).toContain("--page-scale: 1.5;");
  });

  it("grows with the system's text size, as the rest of the app does", () => {
    expect(pageTypographyCss("default", 14, 2)).toBe(":root { --page-scale: 2; }");
    expect(pageTypographyCss("default", 21, 1.5)).toContain("--page-scale: 2.25;");
  });
});

describe("an empty page's placeholder", () => {
  // Bug: the empty paragraph read `attr(data-placeholder)` of itself, but the text was on the
  // editor's root, so an empty page or description showed no hint at all.
  it("is a CSS string the empty paragraph shows", () => {
    expect(placeholderStyle("Write something")).toBe('--placeholder: "Write something";');
  });

  it("keeps quotes and backslashes in the text from breaking out of the string", () => {
    expect(placeholderStyle('Say "hi" \\ bye')).toBe('--placeholder: "Say \\"hi\\" \\\\ bye";');
  });
});

describe("an empty page's caret", () => {
  // The bug: tapping an empty page showed no blinking caret. WebKit hides the caret of an
  // empty line whose placeholder is taken out of the flow (`position: absolute`); floated
  // with no height, the placeholder leaves the caret where it is, at the line's start.
  it("shows the placeholder without hiding the caret", () => {
    expect(PLACEHOLDER_CSS).toContain("float: left");
    expect(PLACEHOLDER_CSS).toContain("height: 0");
    expect(PLACEHOLDER_CSS).not.toContain("position: absolute");
  });
});
