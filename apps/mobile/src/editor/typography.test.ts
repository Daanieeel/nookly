import { PAGE_FONTS } from "@nookly/shared/page-typography";
import { pageSchema } from "./schema.ts";
import { PLACEHOLDER_CSS, isEmptyPage, pageTypographyCss } from "./typography.ts";

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
  // The bug: the placeholder was a `::before` on the page's empty line, inside the text
  // being edited. WebKit then drew no caret on a tap and dropped what was typed, so an
  // empty page seemed not to take a tap. It now sits over the editor, outside the text.
  it("is drawn outside the editable text", () => {
    expect(PLACEHOLDER_CSS).not.toContain("::before");
    expect(PLACEHOLDER_CSS).toContain("pointer-events: none");
  });

  it("shows only on a page with nothing in it", () => {
    const { doc, paragraph, heading } = pageSchema.nodes;
    expect(isEmptyPage(doc.create(null, paragraph.create()))).toBe(true);
    expect(isEmptyPage(doc.create(null, paragraph.create(null, pageSchema.text("x"))))).toBe(false);
    expect(isEmptyPage(doc.create(null, heading.create({ level: 1 })))).toBe(false);
    expect(isEmptyPage(doc.create(null, [paragraph.create(), paragraph.create()]))).toBe(false);
  });
});
