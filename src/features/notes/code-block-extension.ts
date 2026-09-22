import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockComponent } from "./CodeBlockComponent";

/// `CodeBlockLowlight` plus the header row's `filename` attr (persisted the same way
/// as `blockId` — a `data-*` attribute) and the React NodeView that renders it (§ code
/// block header). `language` is already a built-in `CodeBlockLowlight` attribute.
export const CodeBlockWithHeader = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      filename: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-filename"),
        renderHTML: (attributes: { filename?: string | null }) =>
          attributes.filename ? { "data-filename": attributes.filename } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
});
