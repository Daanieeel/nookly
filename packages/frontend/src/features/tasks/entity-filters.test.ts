import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { ENTITY_FILTER_FIELDS, entityFilterValue } from "./shared-view-defs.tsx";

describe("the filters every item has", () => {
  // A Wednesday, so this week and last week both have days before it.
  const now = new Date(2026, 10, 18, 12);

  it("offers Pinned, Created and Updated on any list", () => {
    expect(ENTITY_FILTER_FIELDS.map((f) => f.label)).toEqual(["Pinned", "Created", "Updated"]);
  });

  it("reads an item's value for each of them, and nothing for other fields", () => {
    const entity = makeEntity({
      pinned: true,
      createdAt: new Date(2026, 10, 2, 9).toISOString(),
      updatedAt: new Date(2026, 10, 18, 9).toISOString(),
    });
    expect(entityFilterValue(entity, "pinned", now)).toBe("pinned");
    expect(entityFilterValue({ ...entity, pinned: false }, "pinned", now)).toBe("unpinned");
    expect(entityFilterValue(entity, "created", now)).toBe("earlier");
    expect(entityFilterValue(entity, "updated", now)).toBe("today");
    expect(entityFilterValue(entity, "site", now)).toBeUndefined();
  });
});
