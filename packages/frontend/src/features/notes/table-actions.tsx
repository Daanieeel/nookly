import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconCopyPlus,
  IconEraser,
  IconLink,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
} from "@tabler/icons-react";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import {
  type MenuAction,
  type MenuHelpers,
  registerActions,
} from "#/components/context-menu/registry.ts";
import { tablePartFragment } from "#/features/relationships/mention-utils.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { copyEntityLink } from "#/lib/clipboard.ts";
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

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// The grip of a table row, right-clicked.
    "note.table-row": TablePartTarget;
    /// The grip of a table column, right-clicked.
    "note.table-column": TablePartTarget;
  }
}

/// A row or column of a table in a page, as the right-click menu of its grip sees it.
export interface TablePartTarget {
  editor: Editor;
  /// Where the table starts in the document.
  tablePos: number;
  /// The row or column, counted from 0; the header is row 0.
  index: number;
  /// The table block's client id, which the stored id is looked up by.
  blockId: string;
  /// The page the table is in.
  entityId: string;
  /// Saves pending edits, then maps the block's client id to its stored id. `null` if the
  /// block never got saved.
  resolveStoredId: (blockId: string) => Promise<string | null>;
}

type Part = "row" | "column";

/// Applies an edit if there is one, and puts the caret back in the page.
function apply(target: TablePartTarget, build: (t: TablePartTarget) => Transaction | null) {
  const tr = build(target);
  if (!tr) return;
  target.editor.view.dispatch(tr);
  target.editor.view.focus();
}

function size(target: TablePartTarget) {
  return tableSize(target.editor.state, target.tablePos) ?? { rows: 0, columns: 0 };
}

/// A mention of the row or column: the block's stored id, then `_r2` or `_c3`.
async function copyPartMention(target: TablePartTarget, part: Part) {
  const [storedId, entity] = await Promise.all([
    target.resolveStoredId(target.blockId),
    getEntity(target.entityId),
  ]);
  if (!storedId) throw new Error("Block not saved yet");
  await copyEntityLink(entity, tablePartFragment(storedId, part, target.index + 1));
}

/// Asks first, naming the row or column and how many cells go with it.
function confirmDelete(target: TablePartTarget, part: Part, helpers: MenuHelpers) {
  const { rows, columns } = size(target);
  const cells = part === "row" ? columns : rows;
  const remove = part === "row" ? removeRowAt : removeColumnAt;
  helpers.openDialog((close) => (
    <ConfirmPermanentDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={`Delete ${part} ${target.index + 1}?`}
      description={`The ${part} and what is written in it are removed from the table. Undo brings it back until you leave the page.`}
      stats={[{ value: cells, label: cells === 1 ? "Cell removed" : "Cells removed" }]}
      actionLabel={`Delete ${part}`}
      errorLabel="Couldn't delete, try again"
      status="idle"
      onConfirm={() => {
        apply(target, (t) => remove(t.editor.state, t.tablePos, t.index));
        close();
      }}
    />
  ));
}

const isBody = (t: TablePartTarget) => t.index >= 1;

const rowActions: MenuAction<TablePartTarget>[] = [
  {
    id: "copy-row-mention",
    group: "share",
    label: "Copy Mention to Row",
    icon: IconLink,
    successLabel: "Mention copied",
    run: (target) => copyPartMention(target, "row"),
  },
  {
    id: "add-row-above",
    group: "edit",
    label: "Add 1 row above",
    icon: IconRowInsertTop,
    // Nothing goes above the header.
    when: isBody,
    run: (target) => apply(target, (t) => addRowAt(t.editor.state, t.tablePos, t.index)),
  },
  {
    id: "add-row-below",
    group: "edit",
    label: "Add 1 row below",
    icon: IconRowInsertBottom,
    run: (target) => apply(target, (t) => addRowAt(t.editor.state, t.tablePos, t.index + 1)),
  },
  {
    id: "duplicate-row",
    group: "edit",
    label: "Duplicate row",
    icon: IconCopyPlus,
    when: isBody,
    run: (target) => apply(target, (t) => duplicateRow(t.editor.state, t.tablePos, t.index)),
  },
  {
    id: "move-row-up",
    group: "edit",
    label: "Move row up",
    icon: IconArrowUp,
    // The header stays on top.
    when: (t) => t.index > 1,
    run: (target) =>
      apply(target, (t) => moveRow(t.editor.state, t.tablePos, t.index, t.index - 1)),
  },
  {
    id: "move-row-down",
    group: "edit",
    label: "Move row down",
    icon: IconArrowDown,
    when: (t) => isBody(t) && t.index < size(t).rows - 1,
    run: (target) =>
      apply(target, (t) => moveRow(t.editor.state, t.tablePos, t.index, t.index + 1)),
  },
  {
    id: "clear-row",
    group: "edit",
    label: "Clear row",
    icon: IconEraser,
    run: (target) => apply(target, (t) => clearRow(t.editor.state, t.tablePos, t.index)),
  },
  {
    id: "delete-row",
    group: "danger",
    label: "Delete row",
    icon: IconRowRemove,
    destructive: true,
    when: (t) => size(t).rows > 1,
    run: (target, helpers) => confirmDelete(target, "row", helpers),
  },
];

const columnActions: MenuAction<TablePartTarget>[] = [
  {
    id: "copy-column-mention",
    group: "share",
    label: "Copy Mention to Column",
    icon: IconLink,
    successLabel: "Mention copied",
    run: (target) => copyPartMention(target, "column"),
  },
  {
    id: "add-column-left",
    group: "edit",
    label: "Add 1 column to the left",
    icon: IconColumnInsertLeft,
    run: (target) => apply(target, (t) => addColumnAt(t.editor.state, t.tablePos, t.index)),
  },
  {
    id: "add-column-right",
    group: "edit",
    label: "Add 1 column to the right",
    icon: IconColumnInsertRight,
    run: (target) => apply(target, (t) => addColumnAt(t.editor.state, t.tablePos, t.index + 1)),
  },
  {
    id: "duplicate-column",
    group: "edit",
    label: "Duplicate column",
    icon: IconCopyPlus,
    run: (target) => apply(target, (t) => duplicateColumn(t.editor.state, t.tablePos, t.index)),
  },
  {
    id: "move-column-left",
    group: "edit",
    label: "Move column left",
    icon: IconArrowLeft,
    when: (t) => t.index > 0,
    run: (target) =>
      apply(target, (t) => moveColumnTo(t.editor.state, t.tablePos, t.index, t.index - 1)),
  },
  {
    id: "move-column-right",
    group: "edit",
    label: "Move column right",
    icon: IconArrowRight,
    when: (t) => t.index < size(t).columns - 1,
    run: (target) =>
      apply(target, (t) => moveColumnTo(t.editor.state, t.tablePos, t.index, t.index + 1)),
  },
  {
    id: "clear-column",
    group: "edit",
    label: "Clear column",
    icon: IconEraser,
    run: (target) => apply(target, (t) => clearColumn(t.editor.state, t.tablePos, t.index)),
  },
  {
    id: "delete-column",
    group: "danger",
    label: "Delete column",
    icon: IconColumnRemove,
    destructive: true,
    when: (t) => size(t).columns > 1,
    run: (target, helpers) => confirmDelete(target, "column", helpers),
  },
];

registerActions("note.table-row", rowActions);
registerActions("note.table-column", columnActions);
