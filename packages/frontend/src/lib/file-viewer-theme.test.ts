import { describe, expect, it } from "vitest";
import { parseFileViewerTheme, viewerIsDark } from "./file-viewer-theme.ts";

describe("parseFileViewerTheme", () => {
  it("keeps a picked theme", () => {
    expect(parseFileViewerTheme("light")).toBe("light");
    expect(parseFileViewerTheme("dark")).toBe("dark");
    expect(parseFileViewerTheme("defaults")).toBe("defaults");
  });

  it("uses the defaults when nothing was picked", () => {
    expect(parseFileViewerTheme(null)).toBe("defaults");
  });

  it("turns the old follow the app theme choice into the defaults", () => {
    expect(parseFileViewerTheme("system")).toBe("defaults");
  });
});

describe("viewerIsDark", () => {
  it("draws code and raw text dark and documents light by default", () => {
    expect(viewerIsDark("defaults", "code")).toBe(true);
    expect(viewerIsDark("defaults", "text")).toBe(true);
    expect(viewerIsDark("defaults", "document")).toBe(false);
  });

  it("draws every file in a picked theme", () => {
    expect(viewerIsDark("light", "code")).toBe(false);
    expect(viewerIsDark("light", "text")).toBe(false);
    expect(viewerIsDark("dark", "document")).toBe(true);
  });
});
