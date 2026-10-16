import { describe, expect, it } from "vitest";
import type { SearchHit, Space } from "#/lib/api/types.ts";
import { groupHits } from "./search-results.ts";

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
