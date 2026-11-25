import { describe, expect, it } from "vitest";
import { mergeOrder } from "./order.ts";

describe("merging a saved block order with the stored one", () => {
  it("is the editor's order when nothing changed elsewhere", () => {
    const base = ["a", "b", "c"];
    expect(mergeOrder(base, ["c", "a", "b"], base)).toEqual(["c", "a", "b"]);
    expect(mergeOrder(base, ["a", "new", "c"], [...base, "new"])).toEqual(["a", "new", "c"]);
  });

  it("keeps an order set elsewhere, with a new block behind the one it was typed after", () => {
    expect(mergeOrder(["a", "b", "c"], ["a", "new", "b", "c"], ["c", "a", "b", "new"])).toEqual([
      "c",
      "a",
      "new",
      "b",
    ]);
  });

  it("applies a block moved here on top of an order set elsewhere", () => {
    const base = ["a", "b", "c", "d"];
    // Here "d" went to the top; elsewhere "b" and "c" swapped.
    expect(mergeOrder(base, ["d", "a", "b", "c"], ["a", "c", "b", "d"])).toEqual([
      "d",
      "a",
      "c",
      "b",
    ]);
  });

  it("keeps blocks added elsewhere and leaves out blocks removed on either side", () => {
    expect(mergeOrder(["a", "b", "c"], ["a", "c"], ["x", "c", "b", "a"])).toEqual(["x", "c", "a"]);
    expect(mergeOrder(["a", "b"], ["a", "b", "new"], ["a", "new"])).toEqual(["a", "new"]);
  });
});
