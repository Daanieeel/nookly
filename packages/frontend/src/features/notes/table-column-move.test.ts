import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { dropIndex, moveColumn } from "./table-column-move";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const GRID = "Name\tAge\tCity\nAlice\t30\tOslo\nBob\t25\tRome";

function open(content = GRID) {
  const table = blockToNode({
    id: "t1",
    entityId: "e",
    blockType: "table",
    content,
    position: 0,
    language: null,
    filename: null,
    attrs: {},
    createdAt: "",
    updatedAt: "",
  });
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [table] },
  });
  return editor;
}

/// The table as it is stored: rows by newline, cells by tab.
function stored(target: Editor): string | undefined {
  const doc: JSONNode = target.getJSON();
  const table = doc.content?.[0];
  return table ? nodeToBlockInput(table)?.content : undefined;
}

function move(target: Editor, from: number, to: number): boolean {
  return moveColumn(target.state, (tr) => target.view.dispatch(tr), 0, from, to);
}

describe("moveColumn", () => {
  it("moves a column in every row", () => {
    const target = open();
    expect(move(target, 0, 2)).toBe(true);
    expect(stored(target)).toBe("Age\tCity\tName\n30\tOslo\tAlice\n25\tRome\tBob");
  });

  it("moves a column to the left", () => {
    const target = open();
    expect(move(target, 2, 0)).toBe(true);
    expect(stored(target)).toBe("City\tName\tAge\nOslo\tAlice\t30\nRome\tBob\t25");
  });

  it("swaps neighbours", () => {
    const target = open();
    move(target, 1, 2);
    expect(stored(target)).toBe("Name\tCity\tAge\nAlice\tOslo\t30\nBob\tRome\t25");
  });

  it("keeps the first row as the header", () => {
    const target = open();
    move(target, 0, 2);
    const doc: JSONNode = target.getJSON();
    const rows = doc.content?.[0]?.content ?? [];
    expect(rows[0]?.content?.map((cell) => cell.type)).toEqual([
      "tableHeader",
      "tableHeader",
      "tableHeader",
    ]);
    expect(rows[1]?.content?.map((cell) => cell.type)).toEqual([
      "tableCell",
      "tableCell",
      "tableCell",
    ]);
  });

  it("does nothing for the same column or one that is not there", () => {
    const target = open();
    expect(move(target, 1, 1)).toBe(false);
    expect(move(target, 0, 7)).toBe(false);
    expect(stored(target)).toBe(GRID);
  });

  it("saves as valid table content that loads back in the new order", () => {
    const target = open();
    move(target, 0, 2);
    const content = stored(target) ?? "";
    // Every row has one cell per column, so the content still reads as a table.
    expect(content.split("\n").map((row) => row.split("\t").length)).toEqual([3, 3, 3]);
    const reopened = open(content);
    expect(stored(reopened)).toBe(content);
  });
});

describe("dropIndex", () => {
  it.each([
    // from, target, before, expected final index
    [0, 2, true, 1],
    [0, 2, false, 2],
    [2, 0, true, 0],
    [2, 0, false, 1],
    [1, 1, true, 1],
    [1, 1, false, 1],
    [0, 1, true, 0],
    [1, 0, false, 1],
  ])(
    "column %i dropped on column %i (before: %s) lands at %i",
    (from, target, before, expected) => {
      expect(dropIndex(from, target, before)).toBe(expected);
    },
  );
});
