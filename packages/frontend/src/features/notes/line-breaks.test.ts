import { describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";

const text = (value: string, ...marks: string[]): JSONNode => ({
  type: "text",
  text: value,
  ...(marks.length > 0 && { marks: marks.map((type) => ({ type })) }),
});
const lineBreak = (): JSONNode => ({ type: "hardBreak" });

/// Saves a block the way the editor does, then loads what was saved.
function saveAndReload(node: JSONNode): JSONNode {
  const input = nodeToBlockInput({ ...node, attrs: { ...node.attrs, blockId: "b1" } });
  if (!input) throw new Error("block did not save");
  return blockToNode(
    makeBlock({
      id: "b1",
      blockType: input.blockType,
      content: input.content,
      attrs: input.attrs ?? {},
    }),
  );
}

describe("line breaks inside a text block", () => {
  it.each(["callout", "paragraph"] as const)("keeps a line break in a %s", (type) => {
    const content = [text("one"), lineBreak(), text("two")];
    const reloaded = saveAndReload({ type, content });
    expect(reloaded.content).toEqual(content);
  });

  it("keeps a line break in a heading", () => {
    const content = [text("one"), lineBreak(), text("two")];
    const reloaded = saveAndReload({ type: "heading", attrs: { level: 2 }, content });
    expect(reloaded.content).toEqual(content);
  });

  it("keeps formatting and leading spaces on every line of a callout", () => {
    const content = [
      text("bold", "bold"),
      lineBreak(),
      text("    indented"),
      lineBreak(),
      lineBreak(),
      text("after a gap", "italic"),
    ];
    const reloaded = saveAndReload({ type: "callout", attrs: { variant: "tip" }, content });
    expect(reloaded.content).toEqual(content);
    expect(reloaded.attrs?.variant).toBe("tip");
  });

  it("does not split a list item into two items on a line break", () => {
    const item = (content: JSONNode[]): JSONNode => ({
      type: "listItem",
      content: [{ type: "paragraph", content }],
    });
    const input = nodeToBlockInput({
      type: "bulletList",
      attrs: { blockId: "b1" },
      content: [item([text("one"), lineBreak(), text("two")]), item([text("three")])],
    });
    expect(input?.content.split("\n")).toHaveLength(2);
  });
});
