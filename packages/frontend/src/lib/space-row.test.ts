import { describe, expect, it } from "vitest";
import { cycleSpaceId, moveSpaceId, spaceRow } from "./space-row.ts";

const spaces = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}` }));
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("spaceRow", () => {
  it("shows every Space when there are four or fewer", () => {
    const row = spaceRow(spaces(4), "s2");
    expect(ids(row.visible)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(row.overflow).toEqual([]);
    expect(row.displaced).toBeNull();
  });

  it("shows three Spaces and keeps the rest in the overflow past four", () => {
    const row = spaceRow(spaces(6), "s1");
    expect(ids(row.visible)).toEqual(["s1", "s2", "s3"]);
    expect(ids(row.overflow)).toEqual(["s4", "s5", "s6"]);
    expect(row.displaced).toBeNull();
  });

  it("keeps the row as is while the active Space is one of the visible ones", () => {
    expect(ids(spaceRow(spaces(6), "s3").visible)).toEqual(["s1", "s2", "s3"]);
  });

  it("lets an overflow Space that is active take the last visible slot", () => {
    const row = spaceRow(spaces(6), "s5");
    expect(ids(row.visible)).toEqual(["s1", "s2", "s5"]);
    expect(ids(row.overflow)).toEqual(["s3", "s4", "s6"]);
    expect(row.displaced?.id).toBe("s3");
  });

  it("restores the original row once a visible Space is active again", () => {
    const original = ids(spaceRow(spaces(6), "s1").visible);
    spaceRow(spaces(6), "s5");
    expect(ids(spaceRow(spaces(6), "s2").visible)).toEqual(original);
  });

  it("falls back to the plain row without an active Space", () => {
    expect(ids(spaceRow(spaces(6), null).visible)).toEqual(["s1", "s2", "s3"]);
  });

  it("has no slots without Spaces", () => {
    const row = spaceRow([], null);
    expect(row.visible).toEqual([]);
    expect(row.overflow).toEqual([]);
  });
});

describe("cycleSpaceId", () => {
  const all = ids(spaces(4));

  it("steps through the whole stored order", () => {
    expect(cycleSpaceId(all, "s2", 1)).toBe("s3");
    expect(cycleSpaceId(all, "s2", -1)).toBe("s1");
  });

  it("wraps around only when asked to", () => {
    expect(cycleSpaceId(all, "s4", 1, true)).toBe("s1");
    expect(cycleSpaceId(all, "s1", -1, true)).toBe("s4");
    expect(cycleSpaceId(all, "s4", 1)).toBe("s4");
    expect(cycleSpaceId(all, "s1", -1)).toBe("s1");
  });

  it("starts from the first Space when none is active", () => {
    expect(cycleSpaceId(all, null, 1)).toBe("s1");
    expect(cycleSpaceId(all, "gone", -1)).toBe("s1");
  });

  it("returns null without Spaces", () => {
    expect(cycleSpaceId([], null, 1)).toBeNull();
  });
});

describe("moveSpaceId", () => {
  const all = ids(spaces(6));
  const slot = { temporaryId: "s5", displacedId: "s3" };

  it("moves a Space to the place of the one it was dropped on", () => {
    expect(moveSpaceId(all, "s1", "s3", null)).toEqual(["s2", "s3", "s1", "s4", "s5", "s6"]);
    expect(moveSpaceId(all, "s6", "s2", null)).toEqual(["s1", "s6", "s2", "s3", "s4", "s5"]);
  });

  it("moves across the row and the overflow as one list", () => {
    expect(moveSpaceId(all, "s5", "s1", null)).toEqual(["s5", "s1", "s2", "s3", "s4", "s6"]);
  });

  it("changes nothing for a drop on itself or on an unknown Space", () => {
    expect(moveSpaceId(all, "s2", "s2", null)).toBeNull();
    expect(moveSpaceId(all, "s2", "gone", null)).toBeNull();
    expect(moveSpaceId(all, "gone", "s2", null)).toBeNull();
  });

  it("inserts before the displaced Space when dropped on the temporary slot", () => {
    // s5 is active and shows in the last visible slot, displacing s3.
    expect(moveSpaceId(all, "s1", "s5", slot)).toEqual(["s2", "s1", "s3", "s4", "s5", "s6"]);
    expect(moveSpaceId(all, "s6", "s5", slot)).toEqual(["s1", "s2", "s6", "s3", "s4", "s5"]);
  });

  it("keeps the stored order when the temporary Space itself is dropped elsewhere", () => {
    expect(moveSpaceId(all, "s5", "s1", slot)).toEqual(["s5", "s1", "s2", "s3", "s4", "s6"]);
  });
});
