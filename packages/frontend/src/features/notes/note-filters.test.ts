import { describe, expect, it } from "vitest";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { makeEntity, makeLabel } from "#/test/fixtures.ts";
import { noteFilterFields, passesNoteFilters } from "./note-filters";
import type { NoteRow } from "./NotesListView";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const entity = (id: string, extra: Partial<Entity> = {}) =>
  makeEntity({ id, type: "note", title: id, createdAt: new Date(NOW).toISOString(), ...extra });

function row(id: string, extra: Partial<Entity> = {}, more: Partial<NoteRow> = {}): NoteRow {
  return {
    summary: {
      entity: entity(id, extra),
      preview: "",
      lastEditedAt: new Date(NOW).toISOString(),
      labelIds: [],
      linked: [],
      session: null,
      courses: [],
    },
    title: id,
    preview: "",
    labels: [],
    ...more,
  };
}

const keep = (rows: NoteRow[], filters: ActiveFilter[]) =>
  rows.filter((r) => passesNoteFilters(r, filters, NOW)).map((r) => r.title);

describe("note filters", () => {
  it("filters by course, labels, pinned, last edited and created", () => {
    const algorithms = entity("algorithms", { type: "course", title: "Algorithms" });
    const exam = makeLabel({ id: "exam", name: "Exam" });
    const old = new Date(NOW - 40 * DAY).toISOString();
    const lecture = row("lecture", { pinned: true }, { labels: [exam] });
    lecture.summary.courses = [algorithms];
    const stale = row("stale", { createdAt: old });
    stale.summary.lastEditedAt = old;
    const rows = [lecture, stale];

    expect(keep(rows, [{ fieldId: "course", operator: "is", values: ["algorithms"] }])).toEqual([
      "lecture",
    ]);
    expect(keep(rows, [{ fieldId: "course", operator: "isNot", values: ["algorithms"] }])).toEqual([
      "stale",
    ]);
    expect(keep(rows, [{ fieldId: "labels", operator: "is", values: ["exam"] }])).toEqual([
      "lecture",
    ]);
    expect(keep(rows, [{ fieldId: "pinned", operator: "is", values: ["unpinned"] }])).toEqual([
      "stale",
    ]);
    expect(keep(rows, [{ fieldId: "edited", operator: "is", values: ["week"] }])).toEqual([
      "lecture",
    ]);
    expect(keep(rows, [{ fieldId: "created", operator: "is", values: ["earlier"] }])).toEqual([
      "stale",
    ]);
  });

  it("offers Course and Labels only when some Note carries one", () => {
    const plain = noteFilterFields([row("plain")], []).map((f) => f.id);
    expect(plain).toEqual(["pinned", "edited", "created"]);

    const algorithms = entity("algorithms", { type: "course", title: "Algorithms" });
    const exam = makeLabel({ id: "exam", name: "Exam" });
    const tagged = row("tagged", {}, { labels: [exam] });
    tagged.summary.courses = [algorithms];
    const fields = noteFilterFields([tagged], [exam]);
    expect(fields.map((f) => f.id)).toEqual(["course", "labels", "pinned", "edited", "created"]);
    expect(fields[0]?.options).toMatchObject([
      { value: "algorithms", label: "Algorithms", entityKey: algorithms.key },
    ]);
  });
});
