import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function open(content: JSONContent[]) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content },
  });
  editor.commands.focus("end");
  return editor;
}

/// Presses a key the way the browser delivers it, so every extension's keymap runs.
function press(target: Editor, key: string, shiftKey = false): boolean {
  return Boolean(
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key, shiftKey })),
    ),
  );
}

const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  attrs: { blockId: "p1" },
  content: text ? [{ type: "text", text }] : undefined,
});

describe("Tab in text", () => {
  it("indents a paragraph and keeps focus in the editor", () => {
    const target = open([paragraph("hello")]);
    target.commands.setTextSelection(1);
    expect(press(target, "Tab")).toBe(true);
    expect(target.getText()).toBe("    hello");
  });

  it("indents at the cursor, not only at the start", () => {
    const target = open([paragraph("hello")]);
    target.commands.setTextSelection(3);
    press(target, "Tab");
    expect(target.getText()).toBe("he    llo");
  });

  it("takes up to four leading spaces off with Shift+Tab and still keeps focus", () => {
    const target = open([paragraph("      hello")]);
    expect(press(target, "Tab", true)).toBe(true);
    expect(target.getText()).toBe("  hello");
    expect(press(target, "Tab", true)).toBe(true);
    expect(target.getText()).toBe("hello");
    expect(press(target, "Tab", true)).toBe(true);
    expect(target.getText()).toBe("hello");
  });

  it("still types a tab character in a code block", () => {
    const target = open([{ type: "codeBlock", attrs: { blockId: "c1" } }]);
    expect(press(target, "Tab")).toBe(true);
    expect(target.getText()).toContain("\t");
    expect(target.getText()).not.toContain("    ");
  });

  it("still moves to the next cell in a table", () => {
    const cell = (text: string): JSONContent => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const target = open([
      {
        type: "table",
        attrs: { blockId: "t1" },
        content: [{ type: "tableRow", content: [cell("a"), cell("b")] }],
      },
    ]);
    target.commands.setTextSelection(3);
    const before = target.state.selection.from;
    expect(press(target, "Tab")).toBe(true);
    expect(target.state.selection.from).toBeGreaterThan(before);
    expect(target.getText()).not.toContain("    ");
  });
});

describe("indentation is saved", () => {
  it("keeps leading spaces through the stored markdown and back", () => {
    const target = open([paragraph("hello")]);
    target.commands.setTextSelection(1);
    press(target, "Tab");
    const saved = nodeToBlockInput(target.getJSON().content?.[0] ?? {});
    expect(saved?.content).toBe("    hello");
    const reloaded = blockToNode({
      id: "p1",
      entityId: "e",
      blockType: "paragraph",
      content: saved?.content ?? "",
      position: 0,
      language: null,
      filename: null,
      attrs: {},
      createdAt: "",
      updatedAt: "",
    });
    expect(reloaded.content?.[0]?.text).toBe("    hello");
  });
});

describe("nested lists", () => {
  // Reported, not fixed here (#89): `listLines` in `block-markdown.ts` serializes only the
  // first paragraph of each list item, so what Tab nests under an item is dropped on save.
  // This test pins that known bug; when it is fixed, flip it to expect "a\nb" with nesting.
  it("pins the known bug: a list item nested with Tab loses its nesting on save", () => {
    const item = (text: string): JSONContent => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const target = open([
      { type: "bulletList", attrs: { blockId: "l1" }, content: [item("a"), item("b")] },
    ]);
    press(target, "Tab");
    const doc: JSONNode = target.getJSON();
    const nested = doc.content?.[0];
    expect(nested?.content?.[0]?.content?.length).toBe(2);
    const saved = nodeToBlockInput(nested ?? { type: "doc" });
    expect(saved?.content).toBe("a");
  });
});
