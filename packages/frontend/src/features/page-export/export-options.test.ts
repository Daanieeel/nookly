import { describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { defaultOptions, defaultPageSize, loadOptions, saveOptions } from "./export-options.ts";

describe("export options", () => {
  it("start on Letter in the US and Canada and on A4 elsewhere", () => {
    expect(defaultPageSize("en-US")).toBe("letter");
    expect(defaultPageSize("fr-CA")).toBe("letter");
    expect(defaultPageSize("de-DE")).toBe("a4");
    expect(defaultPageSize("en")).toBe("a4");
  });

  it("come back as they were saved", () => {
    const options = { ...defaultOptions("de-DE"), format: "odt" as const, landscape: true };
    saveOptions(options);
    expect(loadOptions()).toEqual(options);
  });

  it("fall back one by one when a saved value is unknown or broken", () => {
    preferences.set(
      STORAGE_KEYS.pageExport,
      JSON.stringify({ format: "rtf", includeTitle: false, pageSize: "b5", margins: "narrow" }),
    );
    expect(loadOptions()).toMatchObject({
      format: "pdf",
      includeTitle: false,
      margins: "narrow",
      textSize: "medium",
    });
    preferences.set(STORAGE_KEYS.pageExport, "{not json");
    expect(loadOptions()).toEqual(defaultOptions());
  });
});
