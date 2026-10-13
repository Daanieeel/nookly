import { Extension } from "@tiptap/core";
import type { Node as ProseNode, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { findTable, TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";

/// Most columns a table can keep in place; the stylesheet has one rule per count.
export const MAX_PINNED_COLUMNS = 5;

/// How many of a table's leftmost columns stay in place while the rest scrolls sideways:
/// what the table saved, at most `MAX_PINNED_COLUMNS` and never all of its columns, so
/// something is always left to scroll. Zero for anything that is not a table.
export function pinnedColumnCount(table: ProseNode | null | undefined): number {
  if (table?.type.name !== "table") return 0;
  const saved = Number.parseInt(String(table.attrs.pinned ?? ""), 10);
  if (!(saved >= 1)) return 0;
  return Math.min(saved, MAX_PINNED_COLUMNS, TableMap.get(table).width - 1);
}

/// Pins or unpins the column the caret is in. Pinned columns are always the leftmost
/// ones, so this pins every column up to the caret's, or, if that column is pinned
/// already, lets go of it and the columns after it. Returns whether anything changed.
export function togglePinnedColumn(editor: Editor): boolean {
  const { state } = editor;
  const target = pinTarget(editor);
  if (!target) return false;
  const { table, next } = target;
  editor.view.dispatch(
    state.tr.setNodeMarkup(table.pos, undefined, {
      ...table.node.attrs,
      pinned: next >= 1 ? String(next) : null,
    }),
  );
  return true;
}

/// What the pin button would do for the caret's column, `"none"` outside a table or when
/// pinning would leave nothing to scroll.
export function pinState(editor: Editor): "pin" | "unpin" | "none" {
  const target = pinTarget(editor);
  if (!target) return "none";
  return target.next < target.current ? "unpin" : "pin";
}

/// The table the caret is in and the pinned count the button would set, or `null` when
/// that is not allowed.
function pinTarget(editor: Editor) {
  const { $from } = editor.state.selection;
  const table = findTable($from);
  if (!table) return null;
  const map = TableMap.get(table.node);
  const cell = map.findCell($from.before(cellDepth($from)) - table.start);
  const column = cell.left + 1;
  const current = pinnedColumnCount(table.node);
  const next = current >= column ? column - 1 : column;
  if (next > MAX_PINNED_COLUMNS || next >= map.width) return null;
  return { table, current, next };
}

function cellDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") return depth;
  }
  return $pos.depth;
}

/// Sets `--pin-1`, `--pin-2`, ... on each table with pinned columns: how far from the left
/// edge the nth column sticks, which is the width of the pinned columns before it. Measured,
/// because a column can be as wide as the user dragged it. Set on the `<table>` itself, whose
/// attribute changes the editor leaves alone.
function measurePins(dom: HTMLElement) {
  for (const wrapper of dom.querySelectorAll<HTMLElement>(".tableWrapper[data-pinned]")) {
    const table = wrapper.querySelector("table");
    const cells = table?.rows[0]?.cells;
    if (!table || !cells) continue;
    const count = Number(wrapper.dataset.pinned);
    let left = 0;
    for (let index = 1; index <= count; index++) {
      table.style.setProperty(`--pin-${index}`, `${left}px`);
      left += cells[index - 1]?.getBoundingClientRect().width ?? 0;
    }
  }
}

/// Keeps a table's leftmost columns in place while the rest scrolls sideways. The count is
/// a `pinned` attr of the table, saved with it. It reaches the page as `data-pinned` on the
/// table's wrapper, where the stylesheet makes those columns sticky.
export const PinnedColumns = Extension.create({
  name: "pinnedColumns",

  addGlobalAttributes() {
    return [
      {
        types: ["table"],
        attributes: {
          pinned: {
            default: null,
            // Stored as text, the way every block attr is; empty means none.
            parseHTML: (element: HTMLElement) => element.getAttribute("data-pinned"),
            rendered: false,
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("pinnedColumns"),
        props: {
          decorations: ({ doc }) => {
            const decorations: Decoration[] = [];
            doc.descendants((node, pos) => {
              if (node.type.name !== "table") return false;
              const count = pinnedColumnCount(node);
              if (count > 0) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, { "data-pinned": String(count) }),
                );
              }
              return false;
            });
            return DecorationSet.create(doc, decorations);
          },
        },
        view: (view) => {
          measurePins(view.dom);
          // The editor's width decides how wide columns get while the table fits.
          const observer =
            typeof ResizeObserver === "undefined"
              ? null
              : new ResizeObserver(() => measurePins(view.dom));
          observer?.observe(view.dom);
          return {
            update: () => measurePins(view.dom),
            destroy: () => observer?.disconnect(),
          };
        },
      }),
    ];
  },
});
