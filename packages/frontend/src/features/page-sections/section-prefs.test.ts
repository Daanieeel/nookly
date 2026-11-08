import { describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { normalizeSectionPrefs, readSectionPrefs, writeSectionPrefs } from "./section-prefs.ts";

const COURSE = ["sessions", "assignments", "tasks", "exams", "notes"];
const ids = (prefs: { id: string }[]) => prefs.map((p) => p.id);

describe("page section preferences", () => {
  it("shows every section open, in the module's order, until the user changes one", () => {
    const prefs = readSectionPrefs("course", COURSE);
    expect(ids(prefs)).toEqual(COURSE);
    expect(prefs.every((p) => !p.hidden && !p.collapsed)).toBe(true);
  });

  it("keeps the order, the hidden and the folded sections it was given", () => {
    writeSectionPrefs("course", [
      { id: "notes", hidden: false, collapsed: true },
      { id: "sessions", hidden: true, collapsed: false },
      { id: "assignments", hidden: false, collapsed: false },
      { id: "tasks", hidden: false, collapsed: false },
      { id: "exams", hidden: false, collapsed: false },
    ]);
    const prefs = readSectionPrefs("course", COURSE);
    expect(ids(prefs)).toEqual(["notes", "sessions", "assignments", "tasks", "exams"]);
    expect(prefs.find((p) => p.id === "notes")?.collapsed).toBe(true);
    expect(prefs.find((p) => p.id === "sessions")?.hidden).toBe(true);
  });

  it("keeps each page type apart", () => {
    writeSectionPrefs("course", [{ id: "exams", hidden: true, collapsed: false }]);
    expect(readSectionPrefs("exam", ["tasks"])).toEqual([
      { id: "tasks", hidden: false, collapsed: false },
    ]);
    expect(readSectionPrefs("course", COURSE).find((p) => p.id === "exams")?.hidden).toBe(true);
  });

  it("drops sections it no longer knows and repeats, and adds a new one at its default place", () => {
    const prefs = normalizeSectionPrefs(COURSE, [
      { id: "exams", hidden: false, collapsed: false },
      { id: "from-the-future", hidden: true },
      { id: "exams", hidden: true },
      { id: "sessions" },
      { id: "assignments", collapsed: true },
      { id: "notes" },
    ]);
    // Tasks is new to this list: it lands after Assignments, as it is by default.
    expect(ids(prefs)).toEqual(["exams", "sessions", "assignments", "tasks", "notes"]);
    expect(prefs.find((p) => p.id === "exams")?.hidden).toBe(false);
    expect(prefs.find((p) => p.id === "assignments")?.collapsed).toBe(true);
  });

  it("keeps a section's table sort and columns, and drops a table it cannot read", () => {
    const prefs = normalizeSectionPrefs(COURSE, [
      {
        id: "assignments",
        table: { sort: [{ field: "due", direction: "asc" }], columns: [{ field: "title" }] },
      },
      { id: "exams", table: "nonsense" },
    ]);
    expect(prefs.find((p) => p.id === "assignments")?.table).toEqual({
      sort: [{ field: "due", direction: "asc" }],
      columns: [{ field: "title" }],
    });
    expect(prefs.find((p) => p.id === "exams")?.table).toBeUndefined();
  });

  it("falls back to the defaults when the stored value is not readable", () => {
    preferences.set(STORAGE_KEYS.pageSections, "not json");
    expect(ids(readSectionPrefs("course", COURSE))).toEqual(COURSE);
    preferences.set(STORAGE_KEYS.pageSections, '{"course":"nope"}');
    expect(ids(readSectionPrefs("course", COURSE))).toEqual(COURSE);
  });

  it("leaves the other page types untouched when it saves one", () => {
    preferences.set(
      STORAGE_KEYS.pageSections,
      JSON.stringify({ "from-the-future": [{ id: "x", hidden: true }] }),
    );
    writeSectionPrefs("course", [{ id: "exams", hidden: true, collapsed: false }]);
    const stored = JSON.parse(preferences.get(STORAGE_KEYS.pageSections) ?? "{}");
    expect(stored["from-the-future"]).toEqual([{ id: "x", hidden: true }]);
  });
});
