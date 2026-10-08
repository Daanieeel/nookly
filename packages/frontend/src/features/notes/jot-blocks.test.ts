import { describe, expect, it } from "vitest";
import { jotTextToBlocks } from "./jot-blocks";

describe("jotTextToBlocks lettered lists", () => {
  it.each(["a)", "a.", "A)", "A."])("%j list keeps its letters", (first) => {
    const [second] = [first.replace(/[aA]/, (c) => (c === "a" ? "b" : "B"))];
    const blocks = jotTextToBlocks(`${first} One\n${second} Two`);
    expect(blocks).toEqual([
      {
        blockType: "numbered_list",
        content: "One\nTwo",
        language: null,
        attrs: { marker: first },
      },
    ]);
  });

  it("a numbered list has no marker", () => {
    const [block] = jotTextToBlocks("1. One\n2) Two");
    expect(block?.blockType).toBe("numbered_list");
    expect(block?.attrs).toBeUndefined();
  });

  it("a list that does not start at a stays text", () => {
    expect(jotTextToBlocks("b) One")[0]?.blockType).toBe("paragraph");
    expect(jotTextToBlocks("a) One\nc) Two").map((b) => b.blockType)).toEqual([
      "numbered_list",
      "paragraph",
    ]);
  });

  it("a lettered list and a numbered list stay two blocks", () => {
    const blocks = jotTextToBlocks("a) One\n1. Two");
    expect(blocks.map((b) => b.attrs?.marker)).toEqual(["a)", undefined]);
  });
});
