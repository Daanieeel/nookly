import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { type JSONNode, blockToNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import {
  addColumnAt,
  addRowAt,
  clearColumn,
  clearRow,
  duplicateColumn,
  duplicateRow,
  moveColumnTo,
  moveRow,
  removeColumnAt,
  removeRowAt,
  tableSize,
} from "./table-edit";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

/// A table block with these rows, tab separated cells, header row first.
function open(content: string) {
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

const state = (e: Editor) => e.state;
const run = (e: Editor, tr: ReturnType<typeof addRowAt>) => {
  if (!tr) throw new Error("no change");
  e.view.dispatch(tr);
};
function stored(e: Editor): string | undefined {
  const doc: JSONNode = e.getJSON();
  const table = doc.content?.[0];
  return table ? nodeToBlockInput(table)?.content : undefined;
}
const TABLE = "A\tB\tC\n1\t2\t3\n4\t5\t6";

describe("table edits", () => {
  it("measures the table", () => {
    const e = open(TABLE);
    expect(tableSize(state(e), 0)).toEqual({ rows: 3, columns: 3 });
  });

  it("adds an empty row above and below a row", () => {
    const e = open(TABLE);
    run(e, addRowAt(state(e), 0, 2));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n\t\t\n4\t5\t6");
    run(e, addRowAt(state(e), 0, 4));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n\t\t\n4\t5\t6\n\t\t");
  });

  it("adds an empty column left and right of a column", () => {
    const e = open(TABLE);
    run(e, addColumnAt(state(e), 0, 1));
    expect(stored(e)).toBe("A\t\tB\tC\n1\t\t2\t3\n4\t\t5\t6");
    run(e, addColumnAt(state(e), 0, 4));
    expect(stored(e)).toBe("A\t\tB\tC\t\n1\t\t2\t3\t\n4\t\t5\t6\t");
  });

  it("deletes a row and a column", () => {
    const e = open(TABLE);
    run(e, removeRowAt(state(e), 0, 1));
    expect(stored(e)).toBe("A\tB\tC\n4\t5\t6");
    run(e, removeColumnAt(state(e), 0, 1));
    expect(stored(e)).toBe("A\tC\n4\t6");
  });

  it("will not delete the last row or the last column", () => {
    const e = open("A");
    expect(removeRowAt(state(e), 0, 0)).toBeNull();
    expect(removeColumnAt(state(e), 0, 0)).toBeNull();
  });

  it("duplicates a row right below itself, with its text", () => {
    const e = open(TABLE);
    run(e, duplicateRow(state(e), 0, 1));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n1\t2\t3\n4\t5\t6");
  });

  it("duplicates a column right beside itself, in every row", () => {
    const e = open(TABLE);
    run(e, duplicateColumn(state(e), 0, 1));
    expect(stored(e)).toBe("A\tB\tB\tC\n1\t2\t2\t3\n4\t5\t5\t6");
  });

  it("clears the text of a row or a column and keeps the cells", () => {
    const e = open(TABLE);
    run(e, clearRow(state(e), 0, 1));
    expect(stored(e)).toBe("A\tB\tC\n\t\t\n4\t5\t6");
    run(e, clearColumn(state(e), 0, 2));
    expect(stored(e)).toBe("A\tB\t\n\t\t\n4\t5\t");
    expect(tableSize(state(e), 0)).toEqual({ rows: 3, columns: 3 });
  });

  it("moves a row up or down past another row", () => {
    const e = open(TABLE);
    run(e, moveRow(state(e), 0, 2, 1));
    expect(stored(e)).toBe("A\tB\tC\n4\t5\t6\n1\t2\t3");
    run(e, moveRow(state(e), 0, 1, 2));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n4\t5\t6");
  });

  it("keeps the header row where it is", () => {
    const e = open(TABLE);
    expect(moveRow(state(e), 0, 1, 0)).toBeNull();
    expect(moveRow(state(e), 0, 0, 1)).toBeNull();
  });

  it("moves a column left or right", () => {
    const e = open(TABLE);
    run(e, moveColumnTo(state(e), 0, 0, 1));
    expect(stored(e)).toBe("B\tA\tC\n2\t1\t3\n5\t4\t6");
  });

  it("changes nothing outside the table, and one undo takes an edit back", () => {
    const e = open(TABLE);
    run(e, duplicateRow(state(e), 0, 2));
    e.commands.undo();
    expect(stored(e)).toBe(TABLE);
  });

  it("refuses a row or column that is not there", () => {
    const e = open(TABLE);
    expect(removeRowAt(state(e), 0, 9)).toBeNull();
    expect(duplicateColumn(state(e), 0, 9)).toBeNull();
    expect(clearRow(state(e), 0, -1)).toBeNull();
  });
});
