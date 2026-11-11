import type { Editor } from "@tiptap/react";
import { asString } from "./block-markdown";

/// The table that holds a DOM element, as the document sees it: where the table starts, and the
/// client id of its block. `null` for an element that is in no table of this editor.
export function tableOf(editor: Editor, element: Element): { pos: number; blockId: string } | null {
  const table = element.closest("table");
  if (!table || !editor.view.dom.contains(table)) return null;
  const $pos = editor.state.doc.resolve(editor.view.posAtDOM(table, 0));
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === "table") {
      const blockId = asString(node.attrs.blockId);
      return blockId ? { pos: $pos.before(depth), blockId } : null;
    }
  }
  return null;
}
