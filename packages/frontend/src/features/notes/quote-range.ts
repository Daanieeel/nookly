import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { MAX_QUOTE_CHARS } from "#/features/relationships/mention-utils.ts";

/// Text as a link keeps it: runs of white space are one space, and the ends are trimmed.
const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();

/// The text a selection holds, when it sits inside the block at `from` to `to` and holds
/// something to point at; `null` otherwise. Line breaks between paragraphs count as spaces.
export function selectionQuote(state: EditorState, from: number, to: number): string | null {
  const { selection } = state;
  if (selection.empty || selection.from < from || selection.to > to) return null;
  const text = squeeze(state.doc.textBetween(selection.from, selection.to, " ", " "));
  return text === "" ? null : Array.from(text).slice(0, MAX_QUOTE_CHARS).join("");
}

/// Where `quote` is in the block `node`, which starts at `pos` in the document. The text is
/// looked for as it reads (white space squeezed, paragraphs apart by a space), so it is found
/// across bold and italic and from one list item to the next. An exact match comes first, then
/// one that ignores case. `null` when the text is not there anymore.
export function findQuote(
  node: ProseMirrorNode,
  pos: number,
  quote: string,
): { from: number; to: number } | null {
  const wanted = squeeze(quote);
  if (wanted === "") return null;

  // The block's text, one entry per character with where it sits in the document.
  const chars: string[] = [];
  const at: number[] = [];
  node.descendants((child, childPos) => {
    if (child.isTextblock && chars.length > 0 && chars.at(-1) !== " ") {
      chars.push(" ");
      at.push(-1);
    }
    if (!child.isText || child.text === undefined) return true;
    const start = pos + 1 + childPos;
    for (let i = 0; i < child.text.length; i++) {
      const char = child.text[i];
      if (/\s/.test(char)) {
        if (chars.at(-1) === " ") continue;
        chars.push(" ");
      } else {
        chars.push(char);
      }
      at.push(start + i);
    }
    return true;
  });

  const text = chars.join("");
  let index = text.indexOf(wanted);
  if (index === -1) index = text.toLowerCase().indexOf(wanted.toLowerCase());
  if (index === -1) return null;
  const first = at.slice(index, index + wanted.length).find((p) => p >= 0);
  const last = at.slice(index, index + wanted.length).findLast((p) => p >= 0);
  if (first === undefined || last === undefined) return null;
  return { from: first, to: last + 1 };
}

/// Selects `quote` in the block that starts at `pos`, and scrolls it into view. Returns
/// whether it was found; when it was not, nothing changes and the block is all there is to show.
export function selectQuote(view: EditorView, pos: number, quote: string): boolean {
  if (pos < 0 || pos >= view.state.doc.content.size) return false;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return false;
  const range = findQuote(node, pos, quote);
  if (!range) return false;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)),
  );
  const at = view.domAtPos(range.from).node;
  const element = at instanceof HTMLElement ? at : at.parentElement;
  element?.scrollIntoView({ block: "center" });
  return true;
}
