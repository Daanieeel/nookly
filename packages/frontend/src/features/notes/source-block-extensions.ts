import { IconCpu, IconMathFunction, IconSchema, IconSum } from "@tabler/icons-react";
import { CircuitLegend } from "./circuit/CircuitLegend";
import { CircuitCanvas } from "./circuit/CircuitCanvas";
import { renderCircuit } from "./circuit/render";
import { renderDiagram } from "./diagram";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { mathBlockLatex, renderMath } from "./math";
import { hidesCode, SourceBlock, type SourceBlockOptions } from "./SourceBlock";

/// Whether `node` is a block named `name` that is showing its preview, not its code.
function hiddenBlock(
  node: ProseNode | null | undefined,
  name: string,
  options: SourceBlockOptions,
): boolean {
  return node?.type.name === name && hidesCode(node.attrs.view, options);
}

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
        // What a block with an interactive view drew by hand, as JSON.
        ...(defaults.interactive && {
          drawing: {
            default: "",
            parseHTML: (element: HTMLElement) => element.getAttribute("data-drawing") ?? "",
            renderHTML: (attributes: { drawing?: string }) =>
              attributes.drawing ? { "data-drawing": attributes.drawing } : {},
          },
        }),
        view: {
          default: "source",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-view") ?? "source",
          renderHTML: (attributes: { view?: string }) => ({ "data-view": attributes.view }),
        },
      };
    },
    parseHTML() {
      // Above the code block's plain `pre` rule, which would otherwise claim a pasted
      // copy of this block and turn it into code.
      return [{ tag: `pre[data-${name}]`, preserveWhitespace: "full", priority: 60 }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["pre", mergeAttributes(HTMLAttributes, { [`data-${name}`]: "" }), ["code", 0]];
    },
    addNodeView() {
      return ReactNodeViewRenderer(SourceBlock);
    },
    // The code stays in the document while the preview shows, but a caret inside it is
    // invisible and, in WebKit, aborts the app. Arrow keys select the whole block
    // instead, and a caret that lands in it anyway is moved out.
    addProseMirrorPlugins() {
      const hidden = (node: ProseNode | null | undefined) => hiddenBlock(node, name, this.options);
      return [
        new Plugin({
          appendTransaction: (_transactions, _old, state) => {
            const { selection, doc } = state;
            if (!(selection instanceof TextSelection)) return null;
            const { $from, $to } = selection;
            const fromHidden = hidden($from.parent);
            const toHidden = hidden($to.parent);
            if (!fromHidden && !toHidden) return null;
            if ($from.parent === $to.parent) {
              return state.tr.setSelection(NodeSelection.create(doc, $from.before()));
            }
            // A range reaching into the code stops at the block's edge instead.
            const from = fromHidden ? Selection.findFrom(doc.resolve($from.after()), 1) : selection;
            const to = toHidden ? Selection.findFrom(doc.resolve($to.before()), -1) : selection;
            if (!from || !to) return null;
            return state.tr.setSelection(TextSelection.between(from.$from, to.$to));
          },
        }),
      ];
    },
    addKeyboardShortcuts() {
      const hidden = (node: ProseNode | null | undefined) => hiddenBlock(node, name, this.options);
      const selectNeighbor = (direction: -1 | 1, vertical: boolean) => () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!(selection instanceof TextSelection) || !selection.empty) return false;
        const { $from } = selection;
        if (!$from.parent.isTextblock) return false;
        const atEdge = vertical
          ? endOfTextblock(view, direction < 0 ? "up" : "down")
          : direction < 0
            ? $from.parentOffset === 0
            : $from.parentOffset === $from.parent.content.size;
        if (!atEdge) return false;
        const container = $from.node($from.depth - 1);
        const neighbor = container.maybeChild($from.index($from.depth - 1) + direction);
        if (!hidden(neighbor)) return false;
        const pos = direction < 0 ? $from.before() - (neighbor?.nodeSize ?? 0) : $from.after();
        return this.editor.commands.setNodeSelection(pos);
      };
      return {
        ArrowLeft: selectNeighbor(-1, false),
        ArrowRight: selectNeighbor(1, false),
        ArrowUp: selectNeighbor(-1, true),
        ArrowDown: selectNeighbor(1, true),
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

/// Whether the caret is on the first or last line of its block. Needs layout, so a
/// missing one (no real browser) counts as not at the edge.
function endOfTextblock(view: EditorView, direction: "up" | "down"): boolean {
  try {
    return view.endOfTextblock(direction);
  } catch {
    return false;
  }
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
  copyLabel: "Copy LaTeX",
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
  copyLabel: "Copy LaTeX",
});

/// A Mermaid diagram: flowcharts, sequence, class, state, gantt, mind maps, ...
export const Diagram = sourceBlock("diagram", {
  label: "Diagram",
  icon: IconSchema,
  sourceLabel: "Mermaid",
  emptyLabel: "Empty diagram",
  render: renderDiagram,
  centered: true,
});

/// Logic gates from boolean expressions, with a view to draw them by hand.
export const CircuitBlock = sourceBlock("circuit", {
  label: "Circuit",
  icon: IconCpu,
  sourceLabel: "Code",
  emptyLabel: "Empty circuit",
  render: (source, element) => renderCircuit(source, element),
  centered: true,
  copyLabel: "Copy code",
  legend: CircuitLegend,
  interactive: CircuitCanvas,
  interactiveDisabled: "Interactive mode is not available yet.",
});
