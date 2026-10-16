import { describe, expect, it } from "vitest";
import type { SearchHit, Space } from "#/lib/api/types.ts";
import { fuzzyMatch, groupHits, termSegments } from "./search-results.ts";

const space: Space = {
  id: "s1",
  name: "Space",
  icon: null,
  color: "#000",
  createdAt: "",
  updatedAt: "",
  position: 0,
};

function hit(type: string): SearchHit {
  return {
    entityId: type,
    spaceId: "s1",
    title: type,
    type,
    icon: null,
    key: type,
    blockId: null,
    snippet: null,
    blockEntityId: null,
  };
}

describe("groupHits", () => {
  it("orders type groups Files, Notes, Bookmarks, Jots, Tasks, Assignments, Sessions, Courses, Other", () => {
    const types = [
      "semester",
      "course",
      "session",
      "assignment",
      "task",
      "jot",
      "bookmark",
      "note",
      "file",
      "exam",
    ];
    const [group] = groupHits(types.map(hit), [space]);
    expect(group?.types.map((t) => t.label)).toEqual([
      "Files",
      "Notes",
      "Bookmarks",
      "Jots",
      "Tasks",
      "Assignments",
      "Sessions",
      "Courses",
      "Other",
    ]);
    expect(group?.types.at(-1)?.hits.map((h) => h.type)).toEqual(["semester", "exam"]);
  });
});

const COMPOSED = "\u00dcbungsblatt 2";
// macOS spells file names decomposed: U plus a combining diaeresis.
const DECOMPOSED = "U\u0308bungsblatt 2";
const marked = (segments: { text: string; match: boolean }[]) =>
  segments.filter((s) => s.match).map((s) => s.text);

describe("fuzzyMatch with accents", () => {
  it.each(["\u00dcbungs", "U\u0308bungs", "ubungs", "UBUNGS"])(
    "finds a decomposed title by %s and marks the typed part",
    (query) => {
      const match = fuzzyMatch(DECOMPOSED, query);
      expect(match?.tier).toBe(1);
      expect(match?.segments.map((s) => s.text).join("")).toBe(DECOMPOSED);
      expect(marked(match?.segments ?? [])).toEqual(["U\u0308bungs"]);
    },
  );

  it("finds a composed title by the decomposed spelling and by the bare letters", () => {
    expect(marked(fuzzyMatch(COMPOSED, "U\u0308bungs")?.segments ?? [])).toEqual(["\u00dcbungs"]);
    expect(fuzzyMatch(COMPOSED, "ubgs")?.tier).toBe(3);
  });

  it("still rejects letters that are not there", () => {
    expect(fuzzyMatch(DECOMPOSED, "\u00dcxyz")).toBeNull();
  });
});

describe("termSegments with accents", () => {
  it("highlights a decomposed word typed composed, and the other way round", () => {
    expect(marked(termSegments(DECOMPOSED, "\u00fcbungs"))).toEqual(["U\u0308bungs"]);
    expect(marked(termSegments(COMPOSED, "ubungs 2"))).toEqual(["\u00dcbungs", "2"]);
  });
});
