import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";

const INDENT = "    ";

/// Blocks that already give Tab a meaning (code, table cells, list nesting). They run
/// first; this extension stays out of their way.
const TAB_OWNERS = new Set(["codeBlock", "tableCell", "tableHeader", "listItem", "taskItem"]);

/// List items nest with Tab through their own handler, which gives up on the first item
/// of a list (nothing above it to nest under). Tab then does nothing, instead of
/// leaving the editor for the next button.
const LIST_ITEMS = new Set(["listItem", "taskItem"]);

function inListItem($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (LIST_ITEMS.has($pos.node(depth).type.name)) return true;
  }
  return false;
}

function inTabOwner($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (TAB_OWNERS.has(node.type.name) || node.type.spec.code) return true;
  }
  return false;
}

/// Tab in a plain text block (paragraph, heading, callout) types four spaces instead of
/// moving focus out of the editor, and Shift+Tab takes up to four leading spaces off the
/// block. Runs after every other Tab handler.
export const TabIndent = Extension.create({
  name: "tabIndent",
  priority: 50,

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { $from } = editor.state.selection;
        if (inListItem($from)) return true;
        if (inTabOwner($from) || !$from.parent.isTextblock) return false;
        editor.commands.insertContent(INDENT);
        return true;
      },
      "Shift-Tab": ({ editor }) => {
        const { state, view } = editor;
        const { $from } = state.selection;
        if (inListItem($from)) return true;
        if (inTabOwner($from) || !$from.parent.isTextblock) return false;
        const lead = /^ {1,4}/.exec($from.parent.textContent)?.[0];
        if (lead) view.dispatch(state.tr.delete($from.start(), $from.start() + lead.length));
        // Handled even with nothing to remove, so focus never leaves the editor.
        return true;
      },
    };
  },
});
