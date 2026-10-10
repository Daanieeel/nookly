import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { findDuplicate, suggestRelations } from "./import-suggestions.ts";

const entity = (id: string, type: string, title: string) => makeEntity({ id, type, title });

describe("suggestRelations", () => {
  const entities = [
    entity("c1", "course", "Operating Systems"),
    entity("c2", "course", "Linear Algebra"),
    entity("n1", "note", "Operating Systems exam prep"),
    entity("t1", "task", "Buy milk"),
  ];

  it("puts an exact title first, then looser matches", () => {
    const found = suggestRelations("Operating Systems", entities, []);
    expect(found.map((e) => e.id)).toEqual(["c1", "n1"]);
  });

  it("matches on a shared word of four letters or more", () => {
    const found = suggestRelations("Algebra homework", entities, []);
    expect(found.map((e) => e.id)).toEqual(["c2"]);
  });

  it("ignores case and punctuation", () => {
    expect(suggestRelations("operating systems!", entities, []).map((e) => e.id)[0]).toBe("c1");
  });

  it("never suggests an item that is already chosen, and caps the list at three", () => {
    expect(suggestRelations("Operating Systems", entities, ["c1"]).map((e) => e.id)).toEqual([
      "n1",
    ]);
    const many = Array.from({ length: 6 }, (_, i) => entity(`m${i}`, "note", `Physics ${i}`));
    expect(suggestRelations("Physics", many, [])).toHaveLength(3);
  });

  it("suggests nothing for an unrelated title", () => {
    expect(suggestRelations("Zebra", entities, [])).toEqual([]);
    expect(suggestRelations("   ", entities, [])).toEqual([]);
  });
});

describe("findDuplicate", () => {
  const entities = [entity("a", "note", "Physics"), entity("b", "task", "Physics")];

  it("finds an item of the same type with the same title, ignoring case and spacing", () => {
    expect(findDuplicate("note", "  physics ", entities)?.id).toBe("a");
  });

  it("does not count another type or another title", () => {
    expect(findDuplicate("jot", "Physics", entities)).toBeUndefined();
    expect(findDuplicate("note", "Chemistry", entities)).toBeUndefined();
  });

  it("does not count a deleted item", () => {
    const gone = [makeEntity({ id: "x", type: "note", title: "Physics", deletedAt: "2026-01-01" })];
    expect(findDuplicate("note", "Physics", gone)).toBeUndefined();
  });
});
