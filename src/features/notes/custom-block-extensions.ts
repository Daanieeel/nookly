import HorizontalRule from "@tiptap/extension-horizontal-rule";
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
import { ATOM_BLOCK_ATTRS, type AtomBlockType } from "./custom-block-rows";
import { DetailsBlock } from "./DetailsBlock";
import { EntityCardBlock, type EntityCardOptions } from "./EntityCardBlock";
import { MediaBlock, type MediaBlockOptions, type MediaKind } from "./MediaBlock";
import { StatsBlock } from "./StatsBlock";
import { StepsBlock } from "./StepsBlock";

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

/// A block whose whole content is its `rows` string plus the string attrs
/// `ATOM_BLOCK_ATTRS` lists, edited through its own UI rather than as document text.
export function atomBlock(name: AtomBlockType, component: ComponentType<ReactNodeViewProps>) {
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
        ...Object.fromEntries(
          ATOM_BLOCK_ATTRS[name].map((attr) => [
            attr,
            {
              default: null,
              parseHTML: (element: HTMLElement) => element.getAttribute(`data-${attr}`),
              renderHTML: (attributes: Record<string, string | null>) =>
                attributes[attr] ? { [`data-${attr}`]: attributes[attr] } : {},
            },
          ]),
        ),
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

export const Timeline = atomBlock("timeline", TimelineBlock);
export const Progress = atomBlock("progress", ProgressBlock);
export const Tree = atomBlock("tree", TreeBlock);
export const Steps = atomBlock("steps", StepsBlock);
export const Stats = atomBlock("stats", StatsBlock);
export const Details = atomBlock("details", DetailsBlock);

/// A card for a linked entity; `spaceId` is the page's Space.
export const EntityCard = atomBlock("entity_card", EntityCardBlock).extend<EntityCardOptions>({
  addOptions() {
    return { spaceId: "", pageId: "" };
  },
});

/// A media block of one `kind`; `spaceId` is where uploads land.
function mediaBlock(kind: Extract<MediaKind, AtomBlockType>) {
  return atomBlock(kind, MediaBlock).extend<MediaBlockOptions>({
    addOptions() {
      return { kind, spaceId: "" };
    },
  });
}

export const Image = mediaBlock("image");
export const Video = mediaBlock("video");
export const Audio = mediaBlock("audio");
export const FileBlock = mediaBlock("file");

/// StarterKit's horizontal rule (with its `---` input rule), named after the
/// backend block type it saves as.
export const Divider = HorizontalRule.extend({ name: "divider" });
