import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import type { Entity } from "#/lib/api/types.ts";
import { toNoteRows } from "./NotesListView";
import { continueNotes, groupNotes } from "./note-groups";

const algorithms = makeEntity({ id: "c1", type: "course", title: "Algorithms" });
const databases = makeEntity({ id: "c2", type: "course", title: "Databases" });

function row(id: string, edited: string, courses: Entity[] = [], pinned = false) {
  const [made] = toNoteRows(
    [
      {
        entity: makeEntity({ id, type: "note", title: id, pinned }),
        preview: "",
        lastEditedAt: edited,
        labelIds: [],
        linked: [],
        session: null,
        courses,
      },
    ],
    [],
  );
  if (!made) throw new Error("no row");
  return made;
}

describe("groupNotes", () => {
  it("puts Pinned first, then courses by name, then notes without a course", () => {
    const groups = groupNotes([
      row("a", "2026-01-01", []),
      row("b", "2026-01-02", [databases]),
      row("c", "2026-01-03", [algorithms]),
      row("d", "2026-01-04", [algorithms], true),
    ]);
    expect(groups.map((g) => [g.name, g.rows.map((r) => r.title)])).toEqual([
      ["Pinned", ["d"]],
      ["Algorithms", ["c"]],
      ["Databases", ["b"]],
      ["No course", ["a"]],
    ]);
  });

  it("shows a note of several courses once, under the first", () => {
    const groups = groupNotes([row("a", "2026-01-01", [databases, algorithms])]);
    expect(groups.map((g) => g.name)).toEqual(["Databases"]);
  });

  it("calls the only group All notes when nothing is pinned or in a course", () => {
    const groups = groupNotes([row("a", "2026-01-01"), row("b", "2026-01-02")]);
    expect(groups.map((g) => g.name)).toEqual(["All notes"]);
    expect(groups[0]?.rows.map((r) => r.title)).toEqual(["b", "a"]);
  });
});

describe("continueNotes", () => {
  it("takes the latest edits, newest first", () => {
    const rows = [row("a", "2026-01-01"), row("b", "2026-01-03"), row("c", "2026-01-02")];
    expect(continueNotes(rows, 2).map((r) => r.title)).toEqual(["b", "c"]);
  });
});
