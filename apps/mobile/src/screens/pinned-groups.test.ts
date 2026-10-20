import type { EntityRecord } from "@nookly/shared/data";
import { groupPinned, typeLabel } from "./pinned-groups.ts";

// SAFETY: a fixture with only the fields the function under test reads.
const item = (id: string, spaceId: string, type: string): EntityRecord =>
  ({ id, spaceId, type, title: id }) as EntityRecord;

describe("the pinned page", () => {
  it("groups by Space in the given order and by module within it, Other last", () => {
    const spaces = groupPinned(
      [
        item("a", "s2", "task"),
        item("b", "s1", "note"),
        item("c", "s1", "task"),
        item("d", "s1", "mystery"),
        item("e", "s1", "sub_task"),
      ],
      ["s1", "s2", "s3"],
    );
    expect(spaces.map((s) => s.spaceId)).toEqual(["s1", "s2"]);
    expect(spaces[0].count).toBe(4);
    expect(spaces[0].groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Notes", ["b"]],
      ["Tasks", ["c", "e"]],
      ["Other", ["d"]],
    ]);
  });

  it("names the kinds of item", () => {
    expect(typeLabel("sub_task")).toBe("Sub-task");
    expect(typeLabel("whatever")).toBe("Item");
  });
});
