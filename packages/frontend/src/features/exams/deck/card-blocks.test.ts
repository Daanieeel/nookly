import { describe, expect, it } from "vitest";
import type { CardBlock } from "#/lib/api/types.ts";
import {
  blocksToNodes,
  EMPTY_FACE,
  faceBlocks,
  faceSummary,
  isFaceEmpty,
  nodesToBlocks,
  sameFace,
  textToBlocks,
} from "./card-blocks";

const card = (over: Partial<Parameters<typeof faceBlocks>[0]> = {}) => ({
  front: "Q",
  back: "A",
  frontBlocks: null,
  backBlocks: null,
  ...over,
});

describe("textToBlocks", () => {
  it("makes a paragraph per line", () => {
    expect(textToBlocks("one\ntwo")).toEqual([
      { type: "paragraph", content: "one" },
      { type: "paragraph", content: "two" },
    ]);
  });

  it("turns display math into an equation block, over several lines too", () => {
    expect(textToBlocks("Energy:\n$$E = mc^2$$\nso")).toEqual([
      { type: "paragraph", content: "Energy:" },
      { type: "equation", content: "E = mc^2", attrs: { view: "rendered" } },
      { type: "paragraph", content: "so" },
    ]);
    expect(textToBlocks("$$a\n= b$$")).toEqual([
      { type: "equation", content: "a\n= b", attrs: { view: "rendered" } },
    ]);
    expect(textToBlocks("\\[x^2\\]")).toEqual([
      { type: "equation", content: "x^2", attrs: { view: "rendered" } },
    ]);
  });

  it("keeps inline markdown and writes \\(…\\) as $…$", () => {
    expect(textToBlocks("**bold** and \\(x^2\\) and $y$")).toEqual([
      { type: "paragraph", content: "**bold** and $x^2$ and $y$" },
    ]);
  });

  it("gives an empty text one empty paragraph", () => {
    expect(textToBlocks("")).toEqual(EMPTY_FACE);
  });
});

describe("faceBlocks", () => {
  it("prefers the blocks a card was written with", () => {
    const blocks: CardBlock[] = [{ type: "heading2", content: "Hi" }];
    expect(faceBlocks(card({ frontBlocks: blocks }), "front")).toBe(blocks);
  });

  it("falls back to the old text, per side", () => {
    expect(faceBlocks(card(), "back")).toEqual([{ type: "paragraph", content: "A" }]);
  });
});

describe("the editor round trip", () => {
  it("keeps types, content and settings", () => {
    const blocks: CardBlock[] = [
      { type: "paragraph", content: "What is **ATP**?" },
      { type: "image", content: "[cell.png](mention:abc)", attrs: { caption: "A cell" } },
      { type: "equation", content: "E = mc^2", attrs: { view: "source" } },
    ];
    expect(nodesToBlocks(blocksToNodes(blocks))).toEqual(blocks);
  });

  it("does not store unset settings", () => {
    const [block] = nodesToBlocks(
      blocksToNodes([{ type: "image", content: "https://x.dev/a.png" }]),
    );
    expect(block?.attrs).toBeUndefined();
  });
});

describe("isFaceEmpty and sameFace", () => {
  it("counts blank lines as nothing and a picture as something", () => {
    expect(isFaceEmpty(EMPTY_FACE)).toBe(true);
    expect(isFaceEmpty([{ type: "paragraph", content: "  " }])).toBe(true);
    expect(isFaceEmpty([{ type: "image", content: "https://x.dev/a.png" }])).toBe(false);
    expect(isFaceEmpty([{ type: "equation", content: "x" }])).toBe(false);
  });

  it("ignores blank lines at the end", () => {
    const a: CardBlock[] = [{ type: "paragraph", content: "Q" }];
    expect(sameFace(a, [...a, { type: "paragraph", content: "" }])).toBe(true);
    expect(sameFace(a, [{ type: "paragraph", content: "Q?" }])).toBe(false);
  });
});

describe("faceSummary", () => {
  it("is the text of an old card", () => {
    expect(faceSummary(card(), "front")).toBe("Q");
  });

  it("reads blocks as their text, with pictures named and mentions as labels", () => {
    expect(
      faceSummary(
        card({
          frontBlocks: [
            { type: "paragraph", content: "See [Notes](mention:1)" },
            { type: "image", content: "[cell.png](mention:2)" },
          ],
        }),
        "front",
      ),
    ).toBe("See Notes Image");
  });
});
