import { type Editor, Extension, getMarkRange } from "@tiptap/core";
import type { Mark, MarkType } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/// The inline marks that draw a box around their text: a highlight and inline code. They are
/// the same kind of thing to the caret, so they share everything below.
const BOXED_MARKS = ["highlight", "code"];

function boxedTypes(editor: Editor): MarkType[] {
  return BOXED_MARKS.flatMap((name) => {
    const type = editor.schema.marks[name];
    return type ? [type] : [];
  });
}

const has = (marks: readonly Mark[], type: MarkType) => marks.some((m) => m.type === type);

/// How an inline highlight and inline code behave at their edges and when emptied:
///
/// - Deleting everything inside one takes the mark away with it. Left to the browser, an empty
///   `<mark>` or `<code>` stays in the line and what is typed next goes into it, so a line
///   emptied this way would still highlight or still be code. This covers Backspace and Delete,
///   word and line deletes, cut, and a selection deleted (all through `beforeinput`), and a
///   highlight or code started but not typed in yet is dropped by Backspace.
/// - Typed text that would land in such an empty element is inserted with the marks the
///   document has.
/// - At the right edge of the mark the right arrow steps out of it, at the start of a line the
///   left arrow does, and a small gap shows where the caret now is. The next arrow moves on.
export const InlineMarkCleanup = Extension.create({
  name: "inlineMarkCleanup",
  priority: 1000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("inlineMarkCleanup"),
        props: {
          handleKeyDown: (_view, event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return false;
            if (event.key === "ArrowRight" && !event.shiftKey) return stepOut(editor, "right");
            if (event.key === "ArrowLeft" && !event.shiftKey) return stepOut(editor, "left");
            if (event.key !== "Backspace" && event.key !== "Delete") return false;
            if (event.shiftKey) return false;
            if (event.key === "Backspace" && dropPending(editor)) return true;
            const { selection } = editor.state;
            const direction = event.key === "Backspace" ? -1 : 1;
            const at = selection.from + direction;
            return deleteWholeRun(
              editor,
              selection.empty
                ? { from: Math.min(selection.from, at), to: Math.max(selection.from, at) }
                : { from: selection.from, to: selection.to },
            );
          },
          handleDOMEvents: {
            // Deletes the keys above do not catch: by word or line, cut, drag, menus, input methods.
            beforeinput: (view, event) => {
              if (!(event instanceof InputEvent) || !event.inputType.startsWith("delete")) {
                return false;
              }
              const target = event.getTargetRanges?.()[0];
              if (!target) return false;
              try {
                const from = view.posAtDOM(target.startContainer, target.startOffset);
                const to = view.posAtDOM(target.endContainer, target.endOffset);
                if (!deleteWholeRun(editor, { from, to })) return false;
              } catch {
                return false;
              }
              event.preventDefault();
              return true;
            },
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
          // The caret has stepped out of a mark but sits at the same spot in the text, so a
          // small gap, outside the mark, shows where it is.
          decorations: ({ doc, selection, storedMarks }) => {
            if (!selection.empty || !storedMarks) return null;
            const { $from } = selection;
            const type = boxedTypes(editor).find(
              (t) => has($from.marks(), t) && !has(storedMarks, t),
            );
            if (!type) return null;
            const gap = document.createElement("span");
            gap.className = "mark-exit";
            // At the left edge the caret is before the mark and the gap after the caret.
            const left = !$from.nodeBefore || !has($from.nodeBefore.marks, type);
            return DecorationSet.create(doc, [
              Decoration.widget(selection.from, gap, {
                side: left ? 1 : -1,
                marks: [],
                key: "mark-exit",
              }),
            ]);
          },
        },
      }),
    ];
  },
});

/// A highlight or code that was started (its mark is stored) but not typed in yet: Backspace
/// takes the start back. Returns whether there was one.
function dropPending(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection, storedMarks } = state;
  if (!selection.empty || !storedMarks) return false;
  const pending = boxedTypes(editor).filter(
    (t) => has(storedMarks, t) && !has(selection.$from.marks(), t),
  );
  if (pending.length === 0) return false;
  view.dispatch(state.tr.setStoredMarks(storedMarks.filter((m) => !pending.includes(m.type))));
  return true;
}

/// Steps the caret out of the mark at its right edge (`right`), or at the start of a line
/// (`left`), where the mark takes what is typed. The caret stays, drawn outside the mark, and
/// what is typed next is plain. Returns whether it stepped out.
function stepOut(editor: Editor, side: "left" | "right"): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if (side === "left" && $from.parentOffset !== 0) return false;
  const active = state.storedMarks ?? $from.marks();
  const leaving = boxedTypes(editor).filter((type) => {
    if (!has(active, type)) return false;
    // On the right, only where the mark ends; on the left, the mark is right after the caret.
    return side === "right" ? !$from.nodeAfter || !has($from.nodeAfter.marks, type) : true;
  });
  if (leaving.length === 0) return false;
  view.dispatch(state.tr.setStoredMarks(active.filter((m) => !leaving.includes(m.type))));
  return true;
}

/// Deletes `range` when it takes the whole of a run of one of the boxed marks, without the
/// mark, and returns whether it did. Anything else is left to the editor.
function deleteWholeRun(editor: Editor, range: { from: number; to: number }): boolean {
  const { state, view } = editor;
  const { from, to } = range;
  if (from < 0 || to > state.doc.content.size || from >= to) return false;
  if (!state.doc.resolve(from).sameParent(state.doc.resolve(to))) return false;
  const types = boxedTypes(editor);
  for (const type of types) {
    // A character of the run: the one being deleted, or the first of the selection.
    const run = getMarkRange(state.doc.resolve(from + 1), type);
    if (!run || run.from < from || run.to > to) continue;
    if (!state.doc.rangeHasMark(from, to, type)) continue;
    // The caret goes where the run was; setting it first, since it would drop the stored marks.
    const tr = state.tr.delete(from, to);
    tr.setSelection(TextSelection.create(tr.doc, from));
    const rest = tr.doc
      .resolve(from)
      .marks()
      .filter((m) => !types.includes(m.type));
    view.dispatch(tr.setStoredMarks(rest));
    return true;
  }
  return false;
}
