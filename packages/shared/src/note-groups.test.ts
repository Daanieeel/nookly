import { describe, expect, it } from "vitest";
import {
  NO_COURSE_GROUP,
  type NoteGrouping,
  continueNotes,
  groupNotes,
  noteGroupId,
} from "./note-groups";

interface Note {
  id: string;
  edited: string;
  pinned?: boolean;
  courses?: { id: string; title: string }[];
  labels?: { id: string; title: string }[];
}
const by: NoteGrouping<Note> = {
  pinned: (n) => n.pinned ?? false,
  courses: (n) => n.courses ?? [],
  labels: (n) => n.labels ?? [],
  edited: (n) => n.edited,
};
const maths = { id: "c1", title: "Maths" };
const art = { id: "c2", title: "Art" };

describe("groupNotes", () => {
  it("puts Pinned first, then courses by name, then notes without a course", () => {
    const groups = groupNotes(
      [
        { id: "a", edited: "1" },
        { id: "b", edited: "2", courses: [maths] },
        { id: "c", edited: "3", courses: [art] },
        { id: "d", edited: "4", courses: [art], pinned: true },
      ],
      by,
    );
    expect(groups.map((g) => [g.name, g.notes.map((n) => n.id)])).toEqual([
      ["Pinned", ["d"]],
      ["Art", ["c"]],
      ["Maths", ["b"]],
      ["No course", ["a"]],
    ]);
  });

  it("shows a note of several courses once, under the first", () => {
    const groups = groupNotes([{ id: "a", edited: "1", courses: [maths, art] }], by);
    expect(groups.map((g) => g.name)).toEqual(["Maths"]);
  });

  it("calls the only group All notes, latest edit first", () => {
    const groups = groupNotes(
      [
        { id: "a", edited: "1" },
        { id: "b", edited: "2" },
      ],
      by,
    );
    expect(groups.map((g) => g.name)).toEqual(["All notes"]);
    expect(groups[0]?.notes.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("names an untitled course Untitled", () => {
    const groups = groupNotes([{ id: "a", edited: "1", courses: [{ id: "x", title: "" }] }], by);
    expect(groups.map((g) => g.name)).toEqual(["Untitled"]);
  });
});

describe("groupNotes keeping the order", () => {
  it("leaves the notes of a group as they came", () => {
    const groups = groupNotes(
      [
        { id: "a", edited: "1" },
        { id: "b", edited: "2" },
      ],
      by,
      { keepOrder: true },
    );
    expect(groups[0]?.notes.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("continueNotes", () => {
  it("takes the latest edits, newest first", () => {
    const notes = [
      { id: "a", edited: "1" },
      { id: "b", edited: "3" },
      { id: "c", edited: "2" },
    ];
    expect(continueNotes(notes, by, 2).map((n) => n.id)).toEqual(["b", "c"]);
  });
});

describe("groupNotes by label, last edited or nothing", () => {
  const exam = { id: "l1", title: "Exam" };
  const idea = { id: "l2", title: "Idea" };
  const names = (groups: ReturnType<typeof groupNotes<Note>>) =>
    groups.map((g) => [g.name, g.notes.map((n) => n.id)]);

  it("groups by label: Pinned, each label by name, then notes without one", () => {
    const groups = groupNotes(
      [
        { id: "a", edited: "1" },
        { id: "b", edited: "2", labels: [idea] },
        { id: "c", edited: "3", labels: [exam, idea] },
        { id: "d", edited: "4", labels: [exam], pinned: true },
      ],
      by,
      { groupBy: "label" },
    );
    expect(names(groups)).toEqual([
      ["Pinned", ["d"]],
      ["Exam", ["c"]],
      ["Idea", ["b"]],
      ["No label", ["a"]],
    ]);
  });

  it("groups by when it was last edited, newest first", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const groups = groupNotes(
      [
        { id: "old", edited: ago(90) },
        { id: "today", edited: ago(0) },
        { id: "week", edited: ago(3) },
        { id: "month", edited: ago(20) },
      ],
      by,
      { groupBy: "edited", now },
    );
    expect(names(groups)).toEqual([
      ["Today", ["today"]],
      ["Past 7 days", ["week"]],
      ["Past 30 days", ["month"]],
      ["Older", ["old"]],
    ]);
  });

  it("with no grouping lists every note once, pinned ones too", () => {
    const groups = groupNotes(
      [
        { id: "a", edited: "1" },
        { id: "b", edited: "2", pinned: true, courses: [maths] },
      ],
      by,
      { groupBy: "none" },
    );
    expect(names(groups)).toEqual([["All notes", ["b", "a"]]]);
  });

  it("tells which group a note sits in, for the table", () => {
    const note = { id: "a", edited: "1", labels: [exam] };
    expect(noteGroupId(note, by, "label")).toBe("l1");
    expect(noteGroupId(note, by)).toBe(NO_COURSE_GROUP);
    expect(noteGroupId(note, by, "none")).toBe("all");
  });
});
