import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { BLOCK_KINDS } from "./block-conversion";
import { turnInto } from "./context-actions";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function open(content: object[]) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content },
  });
  return editor;
}

const kind = (title: string) => {
  const found = BLOCK_KINDS.find((k) => k.title === title);
  if (!found) throw new Error(title);
  return found;
};

const text = (value: string) => ({ type: "text", text: value });

describe("turnInto in the editor", () => {
  it("rebuilds a row block from a list and keeps the block id", () => {
    const view = open([
      {
        type: "bulletList",
        attrs: { blockId: "b1" },
        content: ["One", "Two"].map((line) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [text(line)] }],
        })),
      },
    ]);
    turnInto(view, "b1", kind("Steps"));
    const [block] = view.getJSON().content ?? [];
    expect(block.type).toBe("steps");
    expect(block.attrs).toMatchObject({ rows: "One\nTwo", blockId: "b1" });
  });

  it("turns a math block into one paragraph per line", () => {
    const view = open([
      { type: "math", attrs: { blockId: "m1" }, content: [text("a &= b\nc &= d")] },
    ]);
    turnInto(view, "m1", kind("Text"));
    const blocks = view.getJSON().content ?? [];
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
    expect(blocks[0].attrs?.blockId).toBe("m1");
  });

  it("still converts text in place and keeps its formatting", () => {
    const view = open([
      {
        type: "paragraph",
        attrs: { blockId: "p1" },
        content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
      },
    ]);
    turnInto(view, "p1", kind("Quote"));
    const quote = view.state.doc.firstChild;
    expect(quote?.type.name).toBe("blockquote");
    expect(quote?.attrs.blockId).toBe("p1");
    expect(quote?.firstChild?.firstChild?.marks.map((mark) => mark.type.name)).toEqual(["bold"]);
  });
});
