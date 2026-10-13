import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { pinnedColumnCount, togglePinnedColumn } from "./table-pinned-columns";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const block = (content: string, attrs: Record<string, string> = {}) => ({
  id: "t1",
  entityId: "e",
  blockType: "table",
  content,
  position: 0,
  language: null,
  filename: null,
  attrs,
  createdAt: "",
  updatedAt: "",
});

function open(attrs: Record<string, string> = {}) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [blockToNode(block("A\tB\tC\tD\n1\t2\t3\t4", attrs))] },
  });
  return editor;
}

/// Puts the caret in the cell at (`row`, `column`), both from 0.
function caretIn(target: Editor, row: number, column: number) {
  let found = -1;
  let seen = 0;
  target.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      if (seen === row * 4 + column) found = pos + 2;
      seen++;
    }
  });
  target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, found)));
}

const pinned = (target: Editor) => pinnedColumnCount(target.state.doc.firstChild);

describe("pinned table columns", () => {
  it("start unpinned", () => {
    expect(pinned(open())).toBe(0);
  });

  it("pin the columns up to the one the caret is in", () => {
    const target = open();
    caretIn(target, 1, 1);
    expect(togglePinnedColumn(target)).toBe(true);
    expect(pinned(target)).toBe(2);
  });

  it("unpin that column and the ones after it when it is pinned already", () => {
    const target = open({ pinned: "3" });
    caretIn(target, 0, 1);
    togglePinnedColumn(target);
    expect(pinned(target)).toBe(1);
    caretIn(target, 0, 0);
    togglePinnedColumn(target);
    expect(pinned(target)).toBe(0);
  });

  it("pin one more column when the caret is just right of the pinned ones", () => {
    const target = open({ pinned: "1" });
    caretIn(target, 0, 1);
    togglePinnedColumn(target);
    expect(pinned(target)).toBe(2);
  });

  it("never pin every column, since nothing would be left to scroll", () => {
    const target = open();
    caretIn(target, 0, 3);
    expect(togglePinnedColumn(target)).toBe(false);
    expect(pinned(target)).toBe(0);
  });

  it("do nothing outside a table", () => {
    const target = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: "<p>text</p>",
    });
    editor = target;
    expect(togglePinnedColumn(target)).toBe(false);
  });

  it("show on the table as a data attribute, never more than all but one column", () => {
    const target = open({ pinned: "2" });
    expect(target.view.dom.querySelector(".tableWrapper")?.getAttribute("data-pinned")).toBe("2");
    const wide = open({ pinned: "9" });
    expect(wide.view.dom.querySelector(".tableWrapper")?.getAttribute("data-pinned")).toBe("3");
  });

  it("leave an unpinned table without the attribute", () => {
    expect(open().view.dom.querySelector(".tableWrapper")?.hasAttribute("data-pinned")).toBe(false);
  });
});

describe("saving pinned columns", () => {
  const saved = (target: Editor) => nodeToBlockInput(target.getJSON().content?.[0] as JSONNode);

  it("keeps the pinned count with the table", () => {
    const target = open({ pinned: "2" });
    expect(saved(target)?.attrs).toEqual({ pinned: "2" });
    expect(saved(target)?.content).toBe("A\tB\tC\tD\n1\t2\t3\t4");
  });

  it("stores no pinned attr for a table without pinned columns", () => {
    expect(saved(open())?.attrs).toEqual({ pinned: "" });
  });
});
