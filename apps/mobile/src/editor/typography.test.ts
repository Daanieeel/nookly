import { PAGE_FONTS } from "@nookly/shared/page-typography";
import { pageTypographyCss } from "./typography.ts";

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
