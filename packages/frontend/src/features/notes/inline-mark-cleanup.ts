import { type Editor, Extension, getMarkRange } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/// The inline marks that draw a box around their text.
const BOXED_MARKS = ["highlight", "code"];

/// Deleting everything inside an inline highlight or inline code takes the mark away with it.
/// Left to the browser, an empty `<mark>` or `<code>` stays in the line and what is typed next
/// goes into it, so a line emptied this way would still highlight or still be code.
///
/// - Backspace and Delete that remove a whole run of the mark do it as a transaction that also
///   drops the mark from the stored ones.
/// - Typed text that would land in an empty box element the document knows nothing about is
///   inserted with the marks the document has.
export const InlineMarkCleanup = Extension.create({
  name: "inlineMarkCleanup",
  priority: 1000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    const types = () =>
      BOXED_MARKS.flatMap((name) => {
        const type = editor.schema.marks[name];
        return type ? [type] : [];
      });
    return [
      new Plugin({
        key: new PluginKey("inlineMarkCleanup"),
        props: {
          handleKeyDown: (_view, event) => {
            if (event.key !== "Backspace" && event.key !== "Delete") return false;
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
            return deleteWholeRun(editor, types(), event.key === "Backspace" ? -1 : 1);
          },
          handleTextInput: (view, from, to, text) => {
            if (from !== to) return false;
            const dom = view.domAtPos(from).node;
            const element = dom instanceof Element ? dom : dom.parentElement;
            const box = element?.closest("mark, code");
            if (!box || box.closest("pre")) return false;
            const name = box.tagName === "MARK" ? "highlight" : "code";
            const marks = view.state.storedMarks ?? view.state.doc.resolve(from).marks();
            if (marks.some((m) => m.type.name === name)) return false;
            // The element is a leftover: the text goes in with the marks the document has.
            view.dispatch(view.state.tr.insertText(text, from, to).setStoredMarks(null));
            return true;
          },
        },
      }),
    ];
  },
});

/// Whether the deletion `direction` of the caret (or of the selection) would empty a run of one
/// of `types`; if so, does it, without the mark. Returns whether it did.
function deleteWholeRun(editor: Editor, types: MarkType[], direction: -1 | 1): boolean {
  const { state, view } = editor;
  const { selection } = state;
  const range = selection.empty
    ? {
        from: Math.min(selection.from, selection.from + direction),
        to: Math.max(selection.from, selection.from + direction),
      }
    : { from: selection.from, to: selection.to };
  if (range.from < 0 || range.to > state.doc.content.size) return false;
  if (!state.doc.resolve(range.from).sameParent(state.doc.resolve(range.to))) return false;
  for (const type of types) {
    // A character of the run: the one being deleted, or the first of the selection.
    const inside = state.doc.resolve(range.from + 1);
    const run = getMarkRange(inside, type);
    if (!run || run.from < range.from || run.to > range.to) continue;
    if (!state.doc.rangeHasMark(range.from, range.to, type)) continue;
    const tr = state.tr.delete(range.from, range.to);
    const rest = tr.doc
      .resolve(range.from)
      .marks()
      .filter((m) => !types.includes(m.type));
    view.dispatch(tr.setStoredMarks(rest));
    return true;
  }
  return false;
}
