import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { asString } from "./block-markdown";

/// DOM id of a heading block, so the page's section navigator can find and
/// scroll to it by id. Built from the block's stable client id.
export function headingAnchorId(blockId: string): string {
  return `heading-${blockId}`;
}

export interface PageSection {
  id: string;
  label: string;
}

/// Longest label the section navigator shows before cutting a heading short.
const MAX_LABEL = 48;

/// The page's top-level headings, in order, as navigator sections.
export function pageSections(doc: ProseMirrorNode): PageSection[] {
  const sections: PageSection[] = [];
  doc.forEach((node) => {
    const blockId = asString(node.attrs.blockId);
    const text = node.textContent.trim();
    if (node.type.name !== "heading" || !blockId || !text) return;
    sections.push({
      id: headingAnchorId(blockId),
      label: text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text,
    });
  });
  return sections;
}

/// Puts `headingAnchorId` on every top-level heading's DOM as a decoration, so
/// the id never reaches the document or the stored blocks.
export const HeadingAnchors = Extension.create({
  name: "headingAnchors",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("headingAnchors"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.forEach((node, pos) => {
              const blockId = asString(node.attrs.blockId);
              if (node.type.name !== "heading" || !blockId) return;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, { id: headingAnchorId(blockId) }),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
