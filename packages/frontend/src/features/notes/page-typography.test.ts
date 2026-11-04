import { beforeEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { applyPageTypography, PAGE_FONTS } from "./page-typography.ts";

const root = document.documentElement;

beforeEach(() => {
  settings.reset("notes.editorFont");
  settings.reset("notes.editorFontSize");
  applyPageTypography();
});

describe("the typography of pages", () => {
  it("leaves pages as they always looked by default", () => {
    expect(root.style.getPropertyValue("--page-font")).toBe("");
    expect(root.style.getPropertyValue("--page-scale")).toBe("1");
  });

  it("follows the font setting as it changes", () => {
    settings.set("notes.editorFont", "serif");
    expect(root.style.getPropertyValue("--page-font")).toBe(PAGE_FONTS.serif);
    settings.set("notes.editorFont", "default");
    expect(root.style.getPropertyValue("--page-font")).toBe("");
  });

  it("scales text from the default size of 14", () => {
    settings.set("notes.editorFontSize", 21);
    expect(root.style.getPropertyValue("--page-scale")).toBe("1.5");
  });
});
