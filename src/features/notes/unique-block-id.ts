import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/// One backend `Block` row per top-level document node (§ notes rewrite) — the
/// reconciliation in `BlockEditor` needs a stable id per node to diff against the
/// last-persisted block list, which ProseMirror doesn't provide on its own.
export const TOP_LEVEL_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "table",
  "callout",
  "timeline",
  "progress",
  "tree",
  "steps",
  "stats",
  "details",
  "divider",
  "taskList",
  "toggle",
  "equation",
  "math",
  "diagram",
  "entity_card",
  "image",
];

function generateBlockId(): string {
  return `blk_${Math.random().toString(36).slice(2, 11)}`;
}

function isString(value: string | number | boolean | null | undefined): value is string {
  return typeof value === "string";
}

export const UniqueBlockId = Extension.create({
  name: "uniqueBlockId",

  addGlobalAttributes() {
    return [
      {
        types: TOP_LEVEL_BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
            renderHTML: (attributes: { blockId?: string | null }) =>
              attributes.blockId ? { "data-block-id": attributes.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("uniqueBlockId"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          let tr = newState.tr;
          let modified = false;
          // A split (Enter inside a block) clones the original node's attrs onto
          // the new sibling, so a merely-non-null `blockId` isn't proof it's
          // actually unique — tracking ids seen so far catches that duplicate and
          // gives the split-off node a fresh one instead of skipping it.
          const seen = new Set<string>();
          newState.doc.forEach((node, pos) => {
            if (!TOP_LEVEL_BLOCK_TYPES.includes(node.type.name)) return;
            const currentId = isString(node.attrs.blockId) ? node.attrs.blockId : null;
            if (!currentId || seen.has(currentId)) {
              const id = generateBlockId();
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id });
              seen.add(id);
              modified = true;
            } else {
              seen.add(currentId);
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
