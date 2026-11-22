import { describe, expect, it } from "vitest";
import { pathFor } from "@/lib/i18n";
import { licenseText } from "@/lib/license-text";
import { license } from "./license";

describe("the license page's text", () => {
  it("reads the full license from the repository, so the page can't drift from it", () => {
    const text = licenseText();
    expect(text.trimStart().startsWith("GNU AFFERO GENERAL PUBLIC LICENSE")).toBe(true);
    expect(text).toContain("Version 3, 19 November 2007");
    expect(text).toContain("END OF TERMS AND CONDITIONS");
  });

  it.each(["en", "de"] as const)("summarizes it in %s with the three groups", (locale) => {
    const doc = license(locale);
    expect(doc.groups.map((g) => g.items.length)).toEqual([5, 2, 5]);
    expect(doc.name).toBe("GNU Affero General Public License v3.0");
    expect(`${doc.intro} ${doc.summary}`).not.toMatch(/[–—]/);
  });

  it("has both languages in step, and a page for each", () => {
    expect(license("en").groups.map((g) => g.items.length)).toEqual(
      license("de").groups.map((g) => g.items.length),
    );
    expect(pathFor("en", "license")).toBe("/license");
    expect(pathFor("de", "license")).toBe("/de/lizenz");
  });
});
