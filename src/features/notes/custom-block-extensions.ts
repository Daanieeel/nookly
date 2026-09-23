import {
  mergeAttributes,
  Node,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import type { ComponentType } from "react";
import { CalloutBlock } from "./CalloutBlock";
import { ProgressBlock } from "./ProgressBlock";
import { TimelineBlock } from "./TimelineBlock";
import { TreeBlock } from "./TreeBlock";

/// Editor nodes of the custom blocks. Each maps to one backend block type of the
/// same name (`block_types.rs`), which owns its content format and its export.

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "note",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-variant") ?? "note",
        renderHTML: (attributes: { variant?: string }) => ({ "data-variant": attributes.variant }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlock);
  },
});

/// A block whose whole content is its `rows` string, edited through its own
/// inputs rather than as document text.
function rowBlock(name: string, component: ComponentType<ReactNodeViewProps>) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        rows: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-rows") ?? "",
          renderHTML: (attributes: { rows?: string }) => ({ "data-rows": attributes.rows }),
        },
        title: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-title"),
          renderHTML: (attributes: { title?: string | null }) =>
            attributes.title ? { "data-title": attributes.title } : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: `div[data-${name}]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { [`data-${name}`]: "" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(component);
    },
  });
}

export const Timeline = rowBlock("timeline", TimelineBlock);
export const Progress = rowBlock("progress", ProgressBlock);
export const Tree = rowBlock("tree", TreeBlock);
