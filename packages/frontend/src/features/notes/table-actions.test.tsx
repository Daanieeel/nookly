import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import { type MenuHelpers, actionsFor, contextTarget } from "#/components/context-menu/registry.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { type JSONNode, blockToNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { type TablePartTarget } from "./table-actions";
import "./table-actions.tsx";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const TABLE = "A\tB\tC\n1\t2\t3\n4\t5\t6";

function open(content = TABLE) {
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

function stored(e: Editor): string | undefined {
  const doc: JSONNode = e.getJSON();
  const table = doc.content?.[0];
  return table ? nodeToBlockInput(table)?.content : undefined;
}

function target(e: Editor, index: number): TablePartTarget {
  return {
    editor: e,
    tablePos: 0,
    index,
    blockId: "client-1",
    entityId: "note-1",
    resolveStoredId: async () => "stored-1",
  };
}

function helpers(over: Partial<MenuHelpers> = {}): MenuHelpers {
  return {
    queryClient: new QueryClient(),
    close: () => {},
    refresh: async () => {},
    openPopover: () => {},
    openDialog: () => {},
    ...over,
  };
}

const labels = (kind: "note.table-row" | "note.table-column", e: Editor, index: number) =>
  actionsFor(kind)
    .filter((a) => !a.when || a.when(target(e, index)))
    .map((a) => (a.label instanceof Function ? a.label(target(e, index)) : a.label));

async function run(kind: "note.table-row" | "note.table-column", id: string, t: TablePartTarget) {
  const action = actionsFor(kind).find((a) => a.id === id);
  if (!action?.run) throw new Error(`no action ${id}`);
  await action.run(t, helpers());
}

beforeEach(() => {
  mockCommand("plugin:clipboard-manager|write_html", null);
  mockCommand(
    "get_entity",
    makeEntity({ id: "note-1", type: "note", title: "Notes", key: "NOT-5" }),
  );
});

describe("the row menu", () => {
  it("offers the mention, adding, duplicating, moving, clearing and deleting", () => {
    const e = open("A\tB\tC\n1\t2\t3\n4\t5\t6\n7\t8\t9");
    expect(labels("note.table-row", e, 2)).toEqual([
      "Copy Mention to Row",
      "Add 1 row above",
      "Add 1 row below",
      "Duplicate row",
      "Move row up",
      "Move row down",
      "Clear row",
      "Delete row",
    ]);
  });

  it("keeps the header row where it is, and adds nothing above it", () => {
    const e = open();
    expect(labels("note.table-row", e, 0)).toEqual([
      "Copy Mention to Row",
      "Add 1 row below",
      "Clear row",
      "Delete row",
    ]);
  });

  it("offers no move up for the first body row and no move down for the last", () => {
    const e = open();
    expect(labels("note.table-row", e, 1)).not.toContain("Move row up");
    expect(labels("note.table-row", e, 2)).not.toContain("Move row down");
  });

  it("copies a mention that points at the row", async () => {
    const e = open();
    await run("note.table-row", "copy-row-mention", target(e, 1));
    const [call] = callsOf("plugin:clipboard-manager|write_html");
    expect(call).toMatchObject({ altText: "[Notes](mention:NOT-5#stored-1_r2)" });
    expect(call).toMatchObject({
      html: expect.stringContaining('href="mention:note-1#stored-1_r2"'),
    });
  });

  it("adds a row above and below", async () => {
    const e = open();
    await run("note.table-row", "add-row-above", target(e, 1));
    expect(stored(e)).toBe("A\tB\tC\n\t\t\n1\t2\t3\n4\t5\t6");
    await run("note.table-row", "add-row-below", target(e, 3));
    expect(stored(e)).toBe("A\tB\tC\n\t\t\n1\t2\t3\n4\t5\t6\n\t\t");
  });

  it("duplicates, moves and clears a row", async () => {
    const e = open();
    await run("note.table-row", "duplicate-row", target(e, 1));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n1\t2\t3\n4\t5\t6");
    await run("note.table-row", "move-row-down", target(e, 2));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n4\t5\t6\n1\t2\t3");
    await run("note.table-row", "move-row-up", target(e, 3));
    expect(stored(e)).toBe("A\tB\tC\n1\t2\t3\n1\t2\t3\n4\t5\t6");
    await run("note.table-row", "clear-row", target(e, 1));
    expect(stored(e)).toBe("A\tB\tC\n\t\t\n1\t2\t3\n4\t5\t6");
  });

  it("asks before it deletes a row, naming it and saying how much goes", async () => {
    const e = open();
    let dialog: ReactNode = null;
    const action = actionsFor("note.table-row").find((a) => a.id === "delete-row");
    await action?.run?.(
      target(e, 1),
      helpers({ openDialog: (render) => void (dialog = render(() => {})) }),
    );
    expect(stored(e)).toBe(TABLE);
    render(<>{dialog}</>);
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Delete row 2?");
    expect(confirm).toHaveTextContent("3");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete row" }));
    await waitFor(() => expect(stored(e)).toBe("A\tB\tC\n4\t5\t6"));
  });

  it("deletes nothing when the dialog is cancelled", async () => {
    const e = open();
    let dialog: ReactNode = null;
    const action = actionsFor("note.table-row").find((a) => a.id === "delete-row");
    await action?.run?.(
      target(e, 1),
      helpers({ openDialog: (render) => void (dialog = render(() => {})) }),
    );
    render(<>{dialog}</>);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(stored(e)).toBe(TABLE);
  });

  it("will not delete the only row", () => {
    const e = open("A\tB");
    expect(labels("note.table-row", e, 0)).not.toContain("Delete row");
  });
});

describe("the column menu", () => {
  it("offers the mention, adding, duplicating, moving, clearing and deleting", () => {
    const e = open();
    expect(labels("note.table-column", e, 1)).toEqual([
      "Copy Mention to Column",
      "Add 1 column to the left",
      "Add 1 column to the right",
      "Duplicate column",
      "Move column left",
      "Move column right",
      "Clear column",
      "Delete column",
    ]);
  });

  it("offers no move left for the first column and no move right for the last", () => {
    const e = open();
    expect(labels("note.table-column", e, 0)).not.toContain("Move column left");
    expect(labels("note.table-column", e, 2)).not.toContain("Move column right");
  });

  it("copies a mention that points at the column", async () => {
    const e = open();
    await run("note.table-column", "copy-column-mention", target(e, 2));
    const [call] = callsOf("plugin:clipboard-manager|write_html");
    expect(call).toMatchObject({ altText: "[Notes](mention:NOT-5#stored-1_c3)" });
  });

  it("adds a column to the left and to the right", async () => {
    const e = open();
    await run("note.table-column", "add-column-left", target(e, 1));
    expect(stored(e)).toBe("A\t\tB\tC\n1\t\t2\t3\n4\t\t5\t6");
    await run("note.table-column", "add-column-right", target(e, 3));
    expect(stored(e)).toBe("A\t\tB\tC\t\n1\t\t2\t3\t\n4\t\t5\t6\t");
  });

  it("duplicates, moves and clears a column", async () => {
    const e = open();
    await run("note.table-column", "duplicate-column", target(e, 0));
    expect(stored(e)).toBe("A\tA\tB\tC\n1\t1\t2\t3\n4\t4\t5\t6");
    await run("note.table-column", "move-column-right", target(e, 1));
    expect(stored(e)).toBe("A\tB\tA\tC\n1\t2\t1\t3\n4\t5\t4\t6");
    await run("note.table-column", "move-column-left", target(e, 2));
    expect(stored(e)).toBe("A\tA\tB\tC\n1\t1\t2\t3\n4\t4\t5\t6");
    await run("note.table-column", "clear-column", target(e, 3));
    expect(stored(e)).toBe("A\tA\tB\t\n1\t1\t2\t\n4\t4\t5\t");
  });

  it("asks before it deletes a column", async () => {
    const e = open();
    let dialog: ReactNode = null;
    const action = actionsFor("note.table-column").find((a) => a.id === "delete-column");
    await action?.run?.(
      target(e, 1),
      helpers({ openDialog: (render) => void (dialog = render(() => {})) }),
    );
    expect(stored(e)).toBe(TABLE);
    render(<>{dialog}</>);
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Delete column 2?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete column" }));
    await waitFor(() => expect(stored(e)).toBe("A\tC\n1\t3\n4\t6"));
  });
});

describe("opening the menu with a right click", () => {
  function Harness({ kind }: { kind: "note.table-row" | "note.table-column" }) {
    const e = open();
    return (
      <div>
        <button type="button" {...contextTarget(kind, target(e, 1))}>
          Handle
        </button>
        <ContextMenuHost />
      </div>
    );
  }

  it.each([
    ["note.table-row", "Add 1 row above"],
    ["note.table-column", "Add 1 column to the left"],
  ] as const)(
    "lists the actions of the %s, with no accessibility violations",
    async (kind, label) => {
      renderWithProviders(<Harness kind={kind} />);
      fireEvent.contextMenu(screen.getByRole("button", { name: "Handle" }));
      expect(await screen.findByRole("menuitem", { name: label })).toBeInTheDocument();
      await expectNoA11yViolations();
    },
  );
});
