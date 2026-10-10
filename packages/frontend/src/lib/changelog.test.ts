import { describe, expect, it } from "vitest";
import changelogText from "../../../../CHANGELOG.md?raw";
import { changelogFor, compareVersions, parseChangelog } from "./changelog.ts";

const TEXT = `# Changelog

All notable changes to Nookly are listed here.

## 0.31.10 (2026-10-10)

### Added

- A new thing

### Fixed

- A broken thing

## 0.30.2 (2026-09-01)

### Changed

- Another thing
`;

describe("parseChangelog", () => {
  it("reads each version with its date and its text, newest first as written", () => {
    const entries = parseChangelog(TEXT);
    expect(entries.map((e) => [e.version, e.date])).toEqual([
      ["0.31.10", "2026-10-10"],
      ["0.30.2", "2026-09-01"],
    ]);
    expect(entries[0]?.body).toBe("### Added\n\n- A new thing\n\n### Fixed\n\n- A broken thing");
    expect(entries[1]?.body).toBe("### Changed\n\n- Another thing");
  });

  it("leaves out the title and the words above the first version", () => {
    for (const entry of parseChangelog(TEXT)) {
      expect(entry.body).not.toContain("All notable changes");
    }
  });

  it("copes with an empty file and a version with no text", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(parseChangelog("## 1.0.0 (2026-01-01)\n")).toEqual([
      { version: "1.0.0", date: "2026-01-01", body: "" },
    ]);
  });

  it("reads the bracketed style some changelogs use", () => {
    expect(parseChangelog("## [1.2.3] - 2026-02-03\n\n- x").map((e) => e.version)).toEqual([
      "1.2.3",
    ]);
  });
});

describe("changelogFor", () => {
  it("gives only the section of the version asked for", () => {
    const entry = changelogFor("0.30.2", TEXT);
    expect(entry?.body).toBe("### Changed\n\n- Another thing");
    expect(entry?.body).not.toContain("A new thing");
  });

  it("is undefined for a version without a section", () => {
    expect(changelogFor("9.9.9", TEXT)).toBeUndefined();
  });

  it("matches the version exactly, not as a prefix", () => {
    expect(changelogFor("0.31.1", TEXT)).toBeUndefined();
  });

  it("reads the file shipped with the app: every section has a date and grouped notes", () => {
    // Written by hand for the people who use Nookly, in the format the What's new dialog
    // reads: a dated version heading over `###` groups of bullet points.
    const entries = parseChangelog(changelogText);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.date, entry.version).not.toBeNull();
      expect(entry.body, entry.version).toContain("###");
      expect(entry.body, entry.version).toContain("- ");
    }
  });
});

describe("compareVersions", () => {
  it.each([
    ["0.31.10", "0.31.9", 1],
    ["0.31.9", "0.31.10", -1],
    ["1.0.0", "0.99.99", 1],
    ["0.31.9", "0.31.9", 0],
    ["0.4.0", "0.31.0", -1],
  ])("%s against %s is %i", (a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected);
  });
});
