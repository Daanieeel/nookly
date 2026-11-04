import { describe, expect, it } from "vitest";
import { SEARCH_TABS, snippetSegments, termSegments } from "./search-results.ts";

const COMPOSED = "\u00dcbungsblatt 2";
// macOS spells file names decomposed: U plus a combining diaeresis.
const DECOMPOSED = "U\u0308bungsblatt 2";
const marked = (segments: { text: string; match: boolean }[]) =>
  segments.filter((s) => s.match).map((s) => s.text);

describe("SEARCH_TABS", () => {
  it("cycles Notes, Tasks, Files, Jots, Bookmarks, Assignments, Courses, Sessions", () => {
    expect(SEARCH_TABS.map((t) => t.label)).toEqual([
      "Notes",
      "Tasks",
      "Files",
      "Jots",
      "Bookmarks",
      "Assignments",
      "Courses",
      "Sessions",
    ]);
  });

  it("lets a Tasks tab show Sub-tasks and a Sessions tab show Session templates", () => {
    expect(SEARCH_TABS.find((t) => t.key === "tasks")?.types).toEqual(["task", "sub_task"]);
    expect(SEARCH_TABS.find((t) => t.key === "sessions")?.types).toEqual([
      "session",
      "session_template",
    ]);
  });
});

describe("termSegments with accents", () => {
  it("highlights a decomposed word typed composed, and the other way round", () => {
    expect(marked(termSegments(DECOMPOSED, "\u00fcbungs"))).toEqual(["U\u0308bungs"]);
    expect(marked(termSegments(COMPOSED, "ubungs 2"))).toEqual(["\u00dcbungs", "2"]);
  });
});

describe("snippetSegments", () => {
  it("marks the matched part and reads mentions as their label", () => {
    expect(snippetSegments("see [\u0001plan\u0002](mention:abc) now")).toEqual([
      { text: "see ", match: false },
      { text: "plan", match: true },
      { text: " now", match: false },
    ]);
  });
});
