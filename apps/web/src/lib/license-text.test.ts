import { describe, expect, it } from "vitest";
import { licenseBlocks, licenseText } from "./license-text";

describe("the license, as blocks", () => {
  const blocks = licenseBlocks(licenseText());

  it("starts with the title, the version and the notice, as the file does", () => {
    expect(blocks[0]).toEqual({ kind: "title", text: "GNU AFFERO GENERAL PUBLIC LICENSE" });
    expect(blocks[1]).toEqual({ kind: "version", text: "Version 3, 19 November 2007" });
    expect(blocks[2]).toMatchObject({ kind: "p" });
    expect(blocks[2]?.text).toMatch(/^Copyright \(C\) 2007 Free Software Foundation, Inc\./);
  });

  it("has the headings of the license, each once", () => {
    const named = (kind: string) => blocks.filter((b) => b.kind === kind).map((b) => b.text);
    expect(named("h3")).toEqual([
      "Preamble",
      "TERMS AND CONDITIONS",
      "END OF TERMS AND CONDITIONS",
      "How to Apply These Terms to Your New Programs",
    ]);
    const sections = named("h4");
    expect(sections).toHaveLength(18);
    expect(sections[0]).toBe("0. Definitions.");
    expect(sections[13]).toBe(
      "13. Remote Network Interaction; Use with the GNU General Public License.",
    );
    expect(sections[17]).toBe("17. Interpretation of Sections 15 and 16.");
  });

  it("joins the file's hard wrapped lines into paragraphs", () => {
    const preamble = blocks.find((b) =>
      b.text.startsWith("The GNU Affero General Public License is a free"),
    );
    expect(preamble?.text).not.toContain("\n");
    expect(preamble?.text).toContain(
      "copyleft license for software and other kinds of works, specifically designed",
    );
  });

  it("keeps the lettered options and the notice template apart from the prose", () => {
    expect(
      blocks.some((b) => b.kind === "item" && b.text.startsWith("a) Convey the object code")),
    ).toBe(true);
    const code = blocks.filter((b) => b.kind === "code");
    expect(code.length).toBeGreaterThan(0);
    expect(code[0]?.text).toContain("<one line to give the program's name");
    expect(code[0]?.text).toContain("\n");
  });

  it("loses no words: every word of the file is on the page", () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
    expect(words(blocks.map((b) => b.text).join(" "))).toBe(words(licenseText()));
  });
});
