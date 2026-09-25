import { Extension } from "@tiptap/react";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import type { Mappable } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/// A selection of whole top-level blocks, from the start of the first to the
/// end of the last (both positions sit between blocks, at depth 0). Picked by
/// clicking a block's grip, or by a text selection that spans several blocks.
/// ProseMirror's own copy, cut, delete and replace all operate on
/// `from`/`to`, so they act on whole blocks with no extra handling.
export class BlockRangeSelection extends Selection {
  static create(doc: ProseMirrorNode, from: number, to: number): BlockRangeSelection {
    return new BlockRangeSelection(doc.resolve(from), doc.resolve(to));
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const $from = doc.resolve(mapping.map(this.from, 1));
    const $to = doc.resolve(mapping.map(this.to, -1));
    if ($from.pos < $to.pos && $from.depth === 0 && $to.depth === 0) {
      return new BlockRangeSelection($from, $to);
    }
    return Selection.near($from);
  }

  eq(other: Selection): boolean {
    return other instanceof BlockRangeSelection && other.from === this.from && other.to === this.to;
  }

  toJSON() {
    return { type: "blockRange", anchor: this.from, head: this.to };
  }

  static fromJSON(doc: ProseMirrorNode, json: { anchor: number; head: number }) {
    return BlockRangeSelection.create(doc, json.anchor, json.head);
  }
}

// Drawn with block decorations instead of the native text highlight, the same
// way ProseMirror's own `NodeSelection` hides it.
BlockRangeSelection.prototype.visible = false;
Selection.jsonID("blockRange", BlockRangeSelection);

/// A run of whole top-level blocks, as document positions between blocks.
export interface BlockRange {
  from: number;
  to: number;
}

/// Top-level block bounds covering `$from`..`$to`.
function blockBounds($from: ResolvedPos, $to: ResolvedPos): BlockRange {
  return {
    from: $from.depth > 0 ? $from.before(1) : $from.pos,
    to: $to.depth > 0 ? $to.after(1) : $to.pos,
  };
}

/// A text selection reaching into more than one top-level block.
function isMultiBlockText(selection: Selection): selection is TextSelection {
  return (
    selection instanceof TextSelection &&
    !selection.empty &&
    selection.$from.index(0) !== selection.$to.index(0)
  );
}

function toBlockSelection(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!isMultiBlockText(selection)) return null;
  const { from, to } = blockBounds(selection.$from, selection.$to);
  return state.tr.setSelection(BlockRangeSelection.create(state.doc, from, to));
}

/// The blocks to paint as highlighted: a block selection, or every block a
/// multi-block text selection touches while it's still being dragged out.
function highlightedRange(selection: Selection): BlockRange | null {
  if (selection instanceof BlockRangeSelection) return { from: selection.from, to: selection.to };
  if (isMultiBlockText(selection)) return blockBounds(selection.$from, selection.$to);
  return null;
}

function highlightDecorations(state: EditorState): DecorationSet {
  const range = highlightedRange(state.selection);
  if (!range) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "block-selected" }));
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

export const BlockSelection = Extension.create({
  name: "blockSelection",
  // Ahead of the default keymaps, so Backspace and typing reach the block
  // selection handlers below before any text command sees them.
  priority: 1000,

  addProseMirrorPlugins() {
    let cached: { state: EditorState; set: DecorationSet } | null = null;

    return [
      new Plugin({
        key: new PluginKey("blockSelection"),
        // Keyboard selections (Shift+arrows) settle into whole blocks as soon as
        // they cross a block boundary. Pointer selections wait for mouseup (see
        // `view` below) so dragging still feels like selecting text.
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((tr) => tr.selectionSet)) return null;
          if (transactions.some((tr) => tr.getMeta("pointer"))) return null;
          return toBlockSelection(state);
        },
        props: {
          // Lets the stylesheet hide the native selection editor wide, which also
          // covers the gaps WebKit paints between blocks and at line ends.
          attributes: (state): Record<string, string> =>
            highlightedRange(state.selection) ? { class: "has-block-selection" } : {},
          decorations(state) {
            if (cached?.state.doc !== state.doc || cached.state.selection !== state.selection) {
              cached = { state, set: highlightDecorations(state) };
            }
            return cached.set;
          },
          handleKeyDown(view, event) {
            const { selection } = view.state;
            if (!(selection instanceof BlockRangeSelection)) return false;
            if (event.key === "Escape") {
              view.dispatch(
                view.state.tr.setSelection(
                  Selection.near(view.state.doc.resolve(selection.to), -1),
                ),
              );
              return true;
            }
            if (event.key === "Backspace" || event.key === "Delete") {
              view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
              return true;
            }
            return false;
          },
          // Typing over a block selection replaces the blocks with one paragraph.
          handleKeyPress(view, event) {
            const { selection, schema } = view.state;
            if (!(selection instanceof BlockRangeSelection)) return false;
            if (event.key.length !== 1 || event.metaKey || event.ctrlKey) return false;
            const paragraph = schema.nodes.paragraph.create(null, schema.text(event.key));
            const tr = view.state.tr.replaceWith(selection.from, selection.to, paragraph);
            tr.setSelection(TextSelection.create(tr.doc, selection.from + 2));
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
        view(editorView) {
          // Runs after ProseMirror's own mouseup has settled the final selection.
          let timer: ReturnType<typeof setTimeout> | undefined;
          const onMouseUp = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              const tr = toBlockSelection(editorView.state);
              if (tr) editorView.dispatch(tr);
            }, 0);
          };
          document.addEventListener("mouseup", onMouseUp);
          return {
            destroy() {
              clearTimeout(timer);
              document.removeEventListener("mouseup", onMouseUp);
            },
          };
        },
      }),
    ];
  },
});
