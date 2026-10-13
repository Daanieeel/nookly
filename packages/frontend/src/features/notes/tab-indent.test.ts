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
  const item = (text: string): JSONContent => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const stored = (target: Editor) =>
    nodeToBlockInput(target.getJSON().content?.[0] ?? { type: "doc" });

  it("nests an item under the one above it with Tab, and Shift+Tab takes it back out", () => {
    const target = open([
      { type: "bulletList", attrs: { blockId: "l1" }, content: [item("a"), item("b")] },
    ]);
    expect(press(target, "Tab")).toBe(true);
    const nested = target.getJSON().content?.[0];
    expect(nested?.content?.length).toBe(1);
    expect(nested?.content?.[0]?.content?.[1]?.type).toBe("bulletList");
    expect(press(target, "Tab", true)).toBe(true);
    expect(target.getJSON().content?.[0]?.content?.length).toBe(2);
  });

  // Was a known bug (#89): only the first paragraph of each item was saved, so an item
  // nested with Tab vanished when the page was saved.
  it("saves a nested item as an indented line", () => {
    const target = open([
      { type: "bulletList", attrs: { blockId: "l1" }, content: [item("a"), item("b")] },
    ]);
    press(target, "Tab");
    expect(stored(target)?.content).toBe("a\n\tb");
  });

  it("keeps focus in the editor when the first item cannot be nested", () => {
    const target = open([
      { type: "bulletList", attrs: { blockId: "l1" }, content: [item("only item")] },
    ]);
    const before = target.getJSON();
    expect(press(target, "Tab")).toBe(true);
    expect(target.getJSON()).toEqual(before);
    expect(target.getText()).not.toContain("    ");
  });

  it("keeps focus in the editor for a checklist item too", () => {
    const target = open([
      {
        type: "taskList",
        attrs: { blockId: "t1" },
        content: [
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] },
        ],
      },
    ]);
    expect(press(target, "Tab")).toBe(true);
    expect(press(target, "Tab", true)).toBe(true);
  });
});

describe("a list block's lines", () => {
  const block = (blockType: string, content: string, attrs: Record<string, string> = {}) => ({
    id: "l1",
    entityId: "e",
    blockType,
    content,
    position: 0,
    language: null,
    filename: null,
    attrs,
    createdAt: "",
    updatedAt: "",
  });
  const roundTrip = (blockType: string, content: string, attrs: Record<string, string> = {}) =>
    nodeToBlockInput(blockToNode(block(blockType, content, attrs)) as JSONNode)?.content;

  it.each(["bulleted_list", "numbered_list"])("keep their nesting in a %s", (type) => {
    const content = "One\n\tOne a\n\tOne b\n\t\tDeep\nTwo\n\tTwo a";
    expect(roundTrip(type, content)).toBe(content);
  });

  it("read a nested line as a list inside the item above", () => {
    const node = blockToNode(block("bulleted_list", "One\n\tOne a\nTwo"));
    expect(node.content?.length).toBe(2);
    const inner = node.content?.[0]?.content?.[1];
    expect(inner?.type).toBe("bulletList");
    expect(inner?.content?.length).toBe(1);
    const numbered = blockToNode(block("numbered_list", "One\n\tOne a"));
    expect(numbered.content?.[0]?.content?.[1]?.type).toBe("orderedList");
  });

  it("never nest deeper than one level below the line above, or on the first line", () => {
    expect(roundTrip("bulleted_list", "\tStart\n\t\t\tToo deep")).toBe("Start\n\tToo deep");
  });

  it("leave a flat list as it was", () => {
    expect(roundTrip("bulleted_list", "a\nb\n\nd")).toBe("a\nb\n\nd");
    expect(roundTrip("bulleted_list", "")).toBe("");
  });
});
