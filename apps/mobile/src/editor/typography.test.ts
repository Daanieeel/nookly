import { PAGE_FONTS } from "@nookly/shared/page-typography";
import { pageTypographyCss, placeholderStyle } from "./typography.ts";

describe("a page's font and size on the phone", () => {
  it("leaves the phone's own font at the default size", () => {
    expect(pageTypographyCss("default", 14)).toBe(":root { --page-scale: 1; }");
  });

  it("follows the font and size chosen in Settings, as the desktop does", () => {
    const css = pageTypographyCss("serif", 21);
    expect(css).toContain(`--page-font: ${PAGE_FONTS.serif};`);
    expect(css).toContain("--page-scale: 1.5;");
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
