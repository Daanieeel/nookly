import { describe, expect, it } from "vitest";
import data from "../../../../whats-new.json";
import { ICON_NAMES } from "../features/whats-new/icons.ts";
import { parseWhatsNew, whatsNewFor } from "./whats-new.ts";

const entry = {
  version: "1.2.3",
  date: "2026-01-02",
  title: "A big one",
  summary: "Things changed.",
  highlights: [
    {
      title: "Import",
      description: "Bring a page in.",
      icon: "file-import",
      tag: "New",
      shortcut: "Mod+I",
    },
    { title: "Plain", description: "No extras." },
  ],
  more: { Improved: ["Faster"], Fixed: ["A crash", "A typo"] },
};

describe("parseWhatsNew", () => {
  it("reads a version with its highlights and the rest", () => {
    const [read] = parseWhatsNew({ versions: [entry] });
    expect(read?.version).toBe("1.2.3");
    expect(read?.highlights).toHaveLength(2);
    expect(read?.highlights[0]).toMatchObject({
      icon: "file-import",
      tag: "New",
      shortcut: "Mod+I",
    });
    expect(read?.more).toEqual({ Improved: ["Faster"], Fixed: ["A crash", "A typo"] });
  });

  it("fills in what a version leaves out", () => {
    const [read] = parseWhatsNew({
      versions: [{ version: "1.0.0", date: "2026-01-01", title: "T", summary: "S" }],
    });
    expect(read?.highlights).toEqual([]);
    expect(read?.more).toEqual({});
  });

  it("skips a broken version and keeps the others, so one typo never hides a release", () => {
    const read = parseWhatsNew({
      versions: [{ version: "1.0.0" }, entry, { ...entry, date: "yesterday" }],
    });
    expect(read.map((e) => e.version)).toEqual(["1.2.3"]);
  });

  it("refuses a tag that is not New or Improved", () => {
    const read = parseWhatsNew({
      versions: [{ ...entry, highlights: [{ title: "x", description: "y", tag: "Hot" }] }],
    });
    expect(read).toEqual([]);
  });
});

describe("whatsNewFor", () => {
  it("finds one version exactly", () => {
    const versions = [entry];
    expect(whatsNewFor("1.2.3", { versions })?.title).toBe("A big one");
    expect(whatsNewFor("1.2", { versions })).toBeUndefined();
    expect(whatsNewFor("9.9.9", { versions })).toBeUndefined();
  });
});

describe("the whats-new.json shipped with the app", () => {
  const entries = parseWhatsNew(data);

  it("has every version valid, none skipped", () => {
    expect(entries).toHaveLength(data.versions.length);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("lists the newest version first", () => {
    const versions = entries.map((e) => e.version);
    const sorted = [...versions].toSorted((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
    expect(versions).toEqual(sorted);
  });

  it("only uses icons the dialog knows", () => {
    for (const e of entries) {
      for (const highlight of e.highlights) {
        if (highlight.icon) expect(ICON_NAMES, highlight.title).toContain(highlight.icon);
      }
    }
  });

  it("keeps each highlight short enough to read at a glance", () => {
    for (const e of entries) {
      for (const highlight of e.highlights) {
        expect(highlight.title.length, highlight.title).toBeLessThanOrEqual(40);
        expect(highlight.description.length, highlight.title).toBeLessThanOrEqual(160);
      }
    }
  });

  it("uses no em or en dashes in what the user reads", () => {
    expect(JSON.stringify(data)).not.toMatch(/[–—]/);
  });
});
