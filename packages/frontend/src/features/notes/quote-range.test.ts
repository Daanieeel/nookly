import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions";
import { findQuote, selectQuote, selectionQuote } from "./quote-range";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function text(value: string, marks: { type: string }[] = []): JSONContent {
  const node: JSONContent = { type: "text", text: value };
  if (marks.length > 0) node.marks = marks;
  return node;
}

function open(content: JSONContent[]) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content },
  });
  return editor;
}

/// The text a range of the page holds.
const textOf = (e: Editor, range: { from: number; to: number } | null) =>
  range ? e.state.doc.textBetween(range.from, range.to, " ") : null;

describe("findQuote", () => {
  it("finds text inside a paragraph", () => {
    const e = open([{ type: "paragraph", content: [text("The cat sat on the mat")] }]);
    expect(textOf(e, findQuote(e.state.doc.child(0), 0, "sat on"))).toBe("sat on");
  });

  it("finds text that runs across bold and italic", () => {
    const e = open([
      {
        type: "paragraph",
        content: [text("a quick "), text("brown", [{ type: "bold" }]), text(" fox jumps")],
      },
    ]);
    expect(textOf(e, findQuote(e.state.doc.child(0), 0, "quick brown fox"))).toBe(
      "quick brown fox",
    );
  });

  it("finds text that runs from one paragraph of the block into the next", () => {
    const e = open([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [text("first item")] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [text("second item")] }] },
        ],
      },
    ]);
    expect(textOf(e, findQuote(e.state.doc.child(0), 0, "item second"))).toBe("item second");
  });

  it("takes the first of several places, and ignores case when the exact text is gone", () => {
    const e = open([{ type: "paragraph", content: [text("go go GO")] }]);
    expect(findQuote(e.state.doc.child(0), 0, "go")).toEqual({ from: 1, to: 3 });
    const mixed = open([{ type: "paragraph", content: [text("stop go GO")] }]);
    expect(textOf(mixed, findQuote(mixed.state.doc.child(0), 0, "Go GO"))).toBe("go GO");
  });

  it("finds nothing when the text is no longer there", () => {
    const e = open([{ type: "paragraph", content: [text("The cat sat")] }]);
    expect(findQuote(e.state.doc.child(0), 0, "the dog")).toBeNull();
    expect(findQuote(e.state.doc.child(0), 0, "")).toBeNull();
  });
});

describe("selectionQuote", () => {
  it("is the selected text inside the block, with spaces for line breaks", () => {
    const e = open([
      { type: "paragraph", content: [text("one two three")] },
      { type: "paragraph", content: [text("next block")] },
    ]);
    e.commands.setTextSelection({ from: 5, to: 8 });
    expect(selectionQuote(e.state, 0, e.state.doc.child(0).nodeSize)).toBe("two");
  });

  it("is nothing for an empty selection or one that leaves the block", () => {
    const e = open([
      { type: "paragraph", content: [text("one two")] },
      { type: "paragraph", content: [text("next block")] },
    ]);
    const first = e.state.doc.child(0).nodeSize;
    e.commands.setTextSelection(3);
    expect(selectionQuote(e.state, 0, first)).toBeNull();
    e.commands.setTextSelection({ from: 3, to: first + 4 });
    expect(selectionQuote(e.state, 0, first)).toBeNull();
  });

  it("is nothing for a selection of spaces only, and squeezes the spaces of the rest", () => {
    const e = open([{ type: "paragraph", content: [text("a   b    c")] }]);
    e.commands.setTextSelection({ from: 2, to: 4 });
    expect(selectionQuote(e.state, 0, e.state.doc.child(0).nodeSize)).toBeNull();
    e.commands.setTextSelection({ from: 1, to: 11 });
    expect(selectionQuote(e.state, 0, e.state.doc.child(0).nodeSize)).toBe("a b c");
  });
});

describe("selectQuote", () => {
  it("selects the text in the block that starts at the position, and says so", () => {
    const e = open([
      { type: "paragraph", content: [text("other block")] },
      { type: "paragraph", content: [text("The cat sat on the mat")] },
    ]);
    const second = e.state.doc.child(0).nodeSize;
    expect(selectQuote(e.view, second, "sat on")).toBe(true);
    const { from, to } = e.state.selection;
    expect(e.state.doc.textBetween(from, to)).toBe("sat on");
  });

  it("leaves the selection alone when the text is gone", () => {
    const e = open([{ type: "paragraph", content: [text("The cat sat")] }]);
    e.commands.setTextSelection(2);
    expect(selectQuote(e.view, 0, "the dog")).toBe(false);
    expect(e.state.selection.from).toBe(2);
    expect(e.state.selection.empty).toBe(true);
  });

  it("does nothing for a position that is not a block", () => {
    const e = open([{ type: "paragraph", content: [text("The cat sat")] }]);
    expect(selectQuote(e.view, 999, "cat")).toBe(false);
  });
});
