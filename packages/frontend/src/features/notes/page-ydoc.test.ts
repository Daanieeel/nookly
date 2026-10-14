import {
  type Block,
  type JSONNode,
  PAGE_FRAGMENT,
  applyBlock,
  nodeToBlockInput,
  pageBlocks,
  readNodes,
  seedPage,
} from "@nookly/shared/blocks";
import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { makeBlock } from "#/test/fixtures.ts";
import { editorExtensions } from "./editor-extensions";

// The shared page document code (`packages/shared/src/blocks/ydoc.ts`) writes and
// reads Yjs without a schema, for the server and the phone. These tests hold it to
// what the real editor, bound through TipTap's Collaboration, reads and writes.

const BLOCKS: Block[] = [
  makeBlock({ id: "b1", position: 0, blockType: "heading2", content: "Week **one**" }),
  makeBlock({
    id: "b2",
    position: 1,
    blockType: "paragraph",
    content: "Some *notes* with `code`, [a link](https://example.com) and $x^2$.",
  }),
  makeBlock({ id: "b3", position: 2, blockType: "bulleted_list", content: "first\nsecond" }),
  makeBlock({ id: "b4", position: 3, blockType: "checklist", content: "[ ] todo\n[x] done" }),
  makeBlock({ id: "b5", position: 4, blockType: "quote", content: "A quote" }),
  makeBlock({
    id: "b6",
    position: 5,
    blockType: "code",
    content: "fn main() {}",
    language: "rust",
    filename: "main.rs",
  }),
  makeBlock({
    id: "b7",
    position: 6,
    blockType: "callout",
    content: "Careful",
    attrs: { variant: "warning" },
  }),
  makeBlock({ id: "b8", position: 7, blockType: "divider", content: "" }),
  makeBlock({ id: "b9", position: 8, blockType: "math", content: "e^{i\\pi} + 1 = 0" }),
];

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function bound(doc: Y.Doc): Editor {
  const editor = new Editor({
    extensions: [
      ...editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      Collaboration.configure({ document: doc, field: PAGE_FRAGMENT }),
    ],
  });
  editors.push(editor);
  return editor;
}

/// The editor keeps an empty paragraph after a last block that isn't one (TipTap's
/// trailing node); it is a real block like any other, left out here to compare.
const inputs = (nodes: JSONNode[]) =>
  nodes
    .map(nodeToBlockInput)
    .filter(
      (i, index, all) =>
        !(index === all.length - 1 && i?.blockType === "paragraph" && i.content === ""),
    );
// SAFETY: `getJSON()` returns the editor's document as ProseMirror JSON.
const editorNodes = (editor: Editor) => (editor.getJSON().content ?? []) as JSONNode[];

describe("a page document", () => {
  it("opens in the editor exactly as its rows were", () => {
    const doc = new Y.Doc();
    seedPage(doc, BLOCKS);
    const editor = bound(doc);
    const expected = BLOCKS.map((b) => ({
      blockId: b.id,
      blockType: b.blockType,
      content: b.content,
    }));
    expect(
      inputs(editorNodes(editor)).map((i) => ({
        blockId: i?.blockId,
        blockType: i?.blockType,
        content: i?.content,
      })),
    ).toEqual(expected);
    expect(inputs(editorNodes(editor))).toEqual(
      inputs(readNodes(doc.getXmlFragment(PAGE_FRAGMENT))),
    );
  });

  it("reads back what the editor wrote, marks included", () => {
    const doc = new Y.Doc();
    seedPage(doc, BLOCKS);
    const editor = bound(doc);
    editor.commands.insertContentAt(editor.state.doc.content.size, [
      { type: "paragraph", content: [{ type: "text", text: "added", marks: [{ type: "bold" }] }] },
    ]);
    editor.commands.setTextSelection(4);
    editor.commands.insertContent("X");
    const fromDoc = pageBlocks(doc).map(({ position: _p, ...rest }) => rest);
    expect(fromDoc).toEqual(editorNodes(editor).map(nodeToBlockInput));
    expect(fromDoc.at(-1)?.content).toBe("**added**");
  });

  it("merges two people typing in the same paragraph, with no conflict", () => {
    const a = new Y.Doc();
    seedPage(a, [makeBlock({ id: "p1", content: "Hello world" })]);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const left = bound(a);
    const right = bound(b);
    // Offline from each other: both type, then exchange what they did.
    left.commands.insertContentAt(7, "brave ");
    right.commands.insertContentAt(12, "!");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(pageBlocks(a)[0].content).toBe("Hello brave world!");
    expect(pageBlocks(b)[0].content).toBe("Hello brave world!");
    expect(editorNodes(left)).toEqual(editorNodes(right));
  });

  it("takes a row changed outside the editor into an open editor", () => {
    const doc = new Y.Doc();
    seedPage(doc, BLOCKS);
    const editor = bound(doc);
    applyBlock(doc, "b5", { ...BLOCKS[4], content: "A changed quote" });
    applyBlock(doc, "b8", null);
    applyBlock(doc, "new", makeBlock({ id: "new", position: 1, content: "Inserted" }));
    const ids = inputs(editorNodes(editor)).map((i) => i?.blockId);
    expect(ids).toEqual(["b1", "new", "b2", "b3", "b4", "b5", "b6", "b7", "b9"]);
    expect(inputs(editorNodes(editor))[5]?.content).toBe("A changed quote");
  });
});
