import { IconMathFunction, IconSum } from "@tabler/icons-react";
import { TextSelection } from "@tiptap/pm/state";
import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";
import { mathBlockLatex, renderMath } from "./math";
import { SourceBlock, type SourceBlockOptions } from "./SourceBlock";

/// A plain text code node with a `view` attr, shown through `SourceBlock`. The
/// node name is the backend block type it saves as.
function sourceBlock(name: string, defaults: SourceBlockOptions) {
  return Node.create<SourceBlockOptions>({
    name,
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,

    addOptions() {
      return defaults;
    },
    addAttributes() {
      return {
        view: {
          default: "source",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-view") ?? "source",
          renderHTML: (attributes: { view?: string }) => ({ "data-view": attributes.view }),
        },
      };
    },
    parseHTML() {
      return [{ tag: `pre[data-${name}]`, preserveWhitespace: "full" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["pre", mergeAttributes(HTMLAttributes, { [`data-${name}`]: "" }), ["code", 0]];
    },
    addNodeView() {
      return ReactNodeViewRenderer(SourceBlock);
    },
    addKeyboardShortcuts() {
      return {
        /// Mod+Enter finishes the code: shows the preview and moves on below.
        "Mod-Enter": () => {
          const { $from } = this.editor.state.selection;
          if ($from.parent.type.name !== this.name) return false;
          const pos = $from.before();
          return this.editor
            .chain()
            .command(({ tr, state }) => {
              tr.setNodeMarkup(pos, undefined, { ...$from.parent.attrs, view: "rendered" });
              const after = pos + $from.parent.nodeSize;
              const next = tr.doc.nodeAt(after);
              if (!next?.isTextblock) tr.insert(after, state.schema.nodes.paragraph.create());
              tr.setSelection(TextSelection.create(tr.doc, after + 1));
              return true;
            })
            .run();
        },
      };
    },
  });
}

const renderLatex =
  (display: (source: string) => string) => (source: string, element: HTMLElement) =>
    Promise.resolve(renderMath(display(source), element, true));

/// One display equation, centered like in a textbook.
export const Equation = sourceBlock("equation", {
  label: "Equation",
  icon: IconMathFunction,
  sourceLabel: "LaTeX",
  emptyLabel: "Empty equation",
  render: renderLatex((source) => source),
  centered: true,
});

/// Several lines of math, one row each and aligned at `&`, for a derivation or
/// a proof.
export const MathBlock = sourceBlock("math", {
  label: "Math block",
  icon: IconSum,
  sourceLabel: "LaTeX",
  emptyLabel: "Empty math block",
  render: renderLatex(mathBlockLatex),
  centered: false,
});
