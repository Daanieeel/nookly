import { Extension } from "@tiptap/core";
import { type EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";

const LIST_ITEMS = new Set(["listItem", "taskItem"]);

/// A copy of the line the cursor is in, put directly below it, with the cursor moved into
/// the copy at the same column. `null` when there is no text cursor to work from.
///
/// A line is a line of text in a code block, and otherwise the whole text block: a
/// paragraph, a heading, a list entry or a task (with its checked state). The change is one
/// transaction, so a single undo removes the copy.
export function duplicateLine(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return null;
  const { $head } = selection;
  const block = $head.parent;
  if (!block.isTextblock) return null;
  const tr = state.tr;

  if (block.type.spec.code) {
    const text = block.textContent;
    const offset = $head.parentOffset;
    const start = text.slice(0, offset).lastIndexOf("\n") + 1;
    const nextBreak = text.indexOf("\n", offset);
    const end = nextBreak === -1 ? text.length : nextBreak;
    const line = text.slice(start, end);
    const at = $head.start() + end;
    tr.insertText(`\n${line}`, at);
    tr.setSelection(TextSelection.create(tr.doc, at + 1 + (offset - start)));
    return tr.scrollIntoView();
  }

  // The copy is a new block: a fresh id is handed out for it (a nested one has none).
  const attrs = "blockId" in block.attrs ? { ...block.attrs, blockId: null } : block.attrs;
  const copy = block.type.create(attrs, block.content, block.marks);
  const item = $head.depth > 1 ? $head.node($head.depth - 1) : null;
  if (item && LIST_ITEMS.has(item.type.name)) {
    // The entry's own nested items stay with the original.
    const at = $head.after($head.depth - 1);
    tr.insert(at, item.type.create(item.attrs, copy));
    tr.setSelection(TextSelection.create(tr.doc, at + 2 + $head.parentOffset));
    return tr.scrollIntoView();
  }
  const at = $head.after();
  tr.insert(at, copy);
  tr.setSelection(TextSelection.create(tr.doc, at + 1 + $head.parentOffset));
  return tr.scrollIntoView();
}

/// Cmd+D (Ctrl+D elsewhere) duplicates the current line. A fixed shortcut, listed read
/// only in Settings (`FIXED_SHORTCUTS`).
export const DuplicateLine = Extension.create({
  name: "duplicateLine",

  addKeyboardShortcuts() {
    return {
      "Mod-d": ({ editor }) => {
        if (!editor.isEditable) return false;
        const tr = duplicateLine(editor.state);
        if (!tr) return false;
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
