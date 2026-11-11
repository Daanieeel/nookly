import { Mark, mergeAttributes } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { parseTextColor, type TextColorId } from "./text-colors";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      /// Colours the selection, or the text typed next when nothing is selected.
      setTextColor: (color: TextColorId) => ReturnType;
      /// Takes the colour off the selection.
      unsetTextColor: () => ReturnType;
    };
  }
}

/// The colour the whole selection has, or null when some of it has none or they differ.
export function textColorOfSelection(state: EditorState): TextColorId | null {
  const type = state.schema.marks.textColor;
  if (!type) return null;
  const { from, to, empty } = state.selection;
  if (empty) {
    const marks = state.storedMarks ?? state.selection.$from.marks();
    return parseTextColor(marks.find((m) => m.type === type)?.attrs.color);
  }
  let color: TextColorId | null | undefined;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isInline) return;
    const next = parseTextColor(node.marks.find((m) => m.type === type)?.attrs.color);
    color = color === undefined || color === next ? next : null;
  });
  return color ?? null;
}

/// Coloured text, stored in the page as `{red}text{/}` (`block-markdown.ts`; a markdown export
/// drops the colour). It works with the other inline marks.
export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseTextColor(element.getAttribute("data-text-color")),
        renderHTML: (attributes: { color?: string | null }) =>
          attributes.color ? { "data-text-color": attributes.color } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-text-color]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          parseTextColor(color) !== null && commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
