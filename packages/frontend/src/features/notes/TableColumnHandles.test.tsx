import { act, fireEvent, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { TableColumnHandles } from "./TableColumnHandles";
import { TableRowHandles } from "./TableRowHandles";
import { claimFor } from "#/components/context-menu/registry.ts";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  // jsdom has none; a test that needs one sets it.
  Reflect.deleteProperty(document, "elementFromPoint");
});

// jsdom has no layout, so every cell claims a 100px wide box in its own column.
beforeEach(() => {
  document.elementFromPoint = () => null;
  HTMLTableCellElement.prototype.getBoundingClientRect = function box() {
    const row = this.parentElement;
    const index = row instanceof HTMLTableRowElement ? Array.from(row.cells).indexOf(this) : 0;
    return new DOMRect(index * 100, 0, 100, 30);
  };
});

function setup() {
  const table = blockToNode({
    id: "t1",
    entityId: "e",
    blockType: "table",
    content: "A\tB\tC\n1\t2\t3",
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
  const view = renderWithProviders(
    <div>
      <EditorContent editor={editor} />
      <TableColumnHandles
        editor={editor}
        entityId="note-1"
        resolveStoredId={async () => "stored-1"}
      />
      <TableRowHandles editor={editor} entityId="note-1" resolveStoredId={async () => "stored-1"} />
    </div>,
  );
  return { ...view, editor };
}

const cell = (index: number): HTMLTableCellElement => {
  const found = document.querySelectorAll<HTMLTableCellElement>("th, td")[index];
  if (!found) throw new Error(`no cell ${index}`);
  return found;
};
const grip = () => screen.getByTestId("table-column-grip");

function stored(target: Editor): string | undefined {
  const doc: JSONNode = target.getJSON();
  const table = doc.content?.[0];
  return table ? nodeToBlockInput(table)?.content : undefined;
}

/// Mouse events are delivered per animation frame, so wait one.
const frame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));

describe("TableColumnHandles", () => {
  it("shows the grip over the column the mouse is on", async () => {
    setup();
    expect(grip()).toHaveClass("opacity-0");
    fireEvent.mouseMove(cell(1));
    await frame();
    expect(grip()).toHaveClass("opacity-100");
    expect(grip().style.getPropertyValue("--grip-left")).toBe("100px");
    expect(grip().style.getPropertyValue("--grip-width")).toBe("100px");
  });

  it("moves a column to where it is dropped, in every row", async () => {
    const { editor: target } = setup();
    fireEvent.mouseMove(cell(0));
    await frame();
    fireEvent.mouseDown(grip());
    // Dropped on the right half of the last column.
    document.elementFromPoint = () => cell(2);
    fireEvent.mouseMove(document, { clientX: 280, clientY: 10 });
    await frame();
    fireEvent.mouseUp(document, { clientX: 280, clientY: 10 });
    expect(stored(target)).toBe("B\tC\tA\n2\t3\t1");
  });

  it("leaves the table alone when dropped on the column it came from", async () => {
    const { editor: target } = setup();
    fireEvent.mouseMove(cell(0));
    await frame();
    fireEvent.mouseDown(grip());
    document.elementFromPoint = () => cell(0);
    fireEvent.mouseUp(document, { clientX: 10, clientY: 10 });
    expect(stored(target)).toBe("A\tB\tC\n1\t2\t3");
  });

  it("leaves the table alone when dropped outside it", async () => {
    const { editor: target } = setup();
    fireEvent.mouseMove(cell(0));
    await frame();
    fireEvent.mouseDown(grip());
    document.elementFromPoint = () => document.body;
    fireEvent.mouseUp(document, { clientX: 900, clientY: 900 });
    expect(stored(target)).toBe("A\tB\tC\n1\t2\t3");
  });
});

/// The target a right click on `element` resolves to, as the menu host would read it.
function rightClick(element: HTMLElement) {
  let seen: Event | null = null;
  const listen = (event: Event) => {
    seen = event;
  };
  document.addEventListener("contextmenu", listen);
  fireEvent.contextMenu(element);
  document.removeEventListener("contextmenu", listen);
  return seen ? claimFor(seen) : undefined;
}

describe("right clicking the grips", () => {
  it("opens the column menu for the column the grip is over", async () => {
    const { editor: target } = setup();
    fireEvent.mouseMove(cell(1));
    await frame();
    const claimed = rightClick(grip());
    if (claimed?.kind !== "note.table-column") throw new Error("not a column target");
    expect(claimed.data.editor === target).toBe(true);
    expect(claimed.data).toMatchObject({
      index: 1,
      tablePos: 0,
      entityId: "note-1",
      blockId: expect.any(String),
    });
  });

  it("opens the row menu for the row the grip is beside", async () => {
    const { editor: target } = setup();
    fireEvent.mouseMove(cell(4));
    await frame();
    const claimed = rightClick(screen.getByTestId("table-row-grip"));
    if (claimed?.kind !== "note.table-row") throw new Error("not a row target");
    expect(claimed.data.editor === target).toBe(true);
    expect(claimed.data).toMatchObject({ index: 1, tablePos: 0, entityId: "note-1" });
  });

  it("opens no menu for a grip that is not over anything", () => {
    setup();
    expect(rightClick(grip())).toBeUndefined();
  });
});
