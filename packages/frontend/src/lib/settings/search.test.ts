import { describe, expect, it } from "vitest";
import { type Searchable, editDistance, scoreSetting, searchSettings } from "./search.ts";

function item(id: string, title: string, description = "", synonyms: string[] = []): Searchable {
  return { id, title, description, synonyms };
}

const THEME = item("appearance.theme", "Theme", "Light, dark, or follow the system.", [
  "dark mode",
  "light mode",
  "colors",
]);
const TIMEZONE = item("general.timezone", "Time zone", "The zone times are shown in.", [
  "clock",
  "utc",
  "region",
]);
const TIME_FORMAT = item("general.timeFormat", "Time format", "12 or 24 hour.", ["am pm"]);
const BACKUP = item("general.backupFolder", "Backup folder", "Where backups are written.", [
  "export",
  "save",
  "copy",
]);

describe("editDistance", () => {
  it("counts single edits and transpositions as one", () => {
    expect(editDistance("theme", "theme")).toBe(0);
    expect(editDistance("theme", "thme")).toBe(1);
    expect(editDistance("theme", "thmee")).toBe(1);
    expect(editDistance("theme", "tehme")).toBe(1);
    expect(editDistance("theme", "color")).toBeGreaterThan(2);
  });
});

describe("scoreSetting", () => {
  it("matches an exact title word", () => {
    expect(scoreSetting("theme", THEME)).toBeGreaterThan(0);
  });

  it("matches a prefix and a substring", () => {
    expect(scoreSetting("the", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("hem", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("hem", THEME)).toBeLessThan(scoreSetting("the", THEME));
  });

  it("matches a synonym", () => {
    expect(scoreSetting("dark mode", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("utc", TIMEZONE)).toBeGreaterThan(0);
  });

  it("matches the id and the description", () => {
    expect(scoreSetting("appearance.theme", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("general", TIMEZONE)).toBeGreaterThan(0);
    expect(scoreSetting("shown", TIMEZONE)).toBeGreaterThan(0);
  });

  it("splits camel case ids", () => {
    expect(
      scoreSetting("backup folder", item("general.backupFolder", "x", "y", ["z"])),
    ).toBeGreaterThan(0);
    expect(scoreSetting("timeformat", TIME_FORMAT)).toBeGreaterThan(0);
  });

  it("tolerates one typo in words of four letters or more", () => {
    expect(scoreSetting("thme", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("backpu", BACKUP)).toBeGreaterThan(0);
    expect(scoreSetting("folde", BACKUP)).toBeGreaterThan(0);
  });

  it("does not guess at short words", () => {
    expect(scoreSetting("tmz", TIMEZONE)).toBe(0);
    expect(scoreSetting("thm", THEME)).toBe(0);
  });

  it("tolerates two typos only in words of eight letters or more", () => {
    expect(scoreSetting("bakxupfolder", item("a.b", "Backupfolder"))).toBeGreaterThan(0);
    expect(scoreSetting("bakxupf", item("a.b", "Backupf"))).toBe(0);
    expect(scoreSetting("themmmee", item("a.b", "Theme"))).toBe(0);
  });

  it("needs every word to match somewhere", () => {
    expect(scoreSetting("dark colors", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("dark banana", THEME)).toBe(0);
  });

  it("ignores case and diacritics", () => {
    expect(scoreSetting("THEME", THEME)).toBeGreaterThan(0);
    expect(scoreSetting("cafe", item("a.b", "Café", "x"))).toBeGreaterThan(0);
    expect(scoreSetting("café", item("a.b", "Cafe", "x"))).toBeGreaterThan(0);
  });

  it("scores an empty query as no filter", () => {
    expect(scoreSetting("   ", THEME)).toBeGreaterThan(0);
  });

  it("matches nothing unrelated", () => {
    expect(scoreSetting("zebra", THEME)).toBe(0);
  });

  it("weighs title over synonym over id over description", () => {
    const title = item("a.zzz", "Banana", "none", ["none"]);
    const synonym = item("a.zzz", "none", "none", ["banana"]);
    const id = item("a.banana", "none", "none", ["none"]);
    const description = item("a.zzz", "none", "banana", ["none"]);
    const scores = [title, synonym, id, description].map((i) => scoreSetting("banana", i));
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
    expect(scores[3]).toBeGreaterThan(0);
  });
});

describe("searchSettings", () => {
  const ALL = [THEME, TIMEZONE, TIME_FORMAT, BACKUP];

  it("returns everything in order for an empty query", () => {
    expect(searchSettings("", ALL)).toEqual(ALL);
  });

  it("drops what does not match", () => {
    expect(searchSettings("backup", ALL)).toEqual([BACKUP]);
    expect(searchSettings("zebra", ALL)).toEqual([]);
  });

  it("ranks a title match above a description match", () => {
    expect(searchSettings("time", ALL).map((i) => i.id)).toEqual([
      "general.timezone",
      "general.timeFormat",
    ]);
    const inDescription = item("a.b", "Other", "Shows the theme");
    expect(searchSettings("theme", [inDescription, THEME])).toEqual([THEME, inDescription]);
  });

  it("keeps the original order for equal scores", () => {
    const a = item("a.one", "Same", "x", ["x"]);
    const b = item("a.two", "Same", "x", ["x"]);
    expect(searchSettings("same", [a, b])).toEqual([a, b]);
    expect(searchSettings("same", [b, a])).toEqual([b, a]);
  });
});
