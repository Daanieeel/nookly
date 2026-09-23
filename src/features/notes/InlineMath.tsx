import {
  InputRule,
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { renderMath } from "./math";

/// `$…$` with no space just inside either dollar and no digit right after the
/// closing one, so "$5 and $10" stays text (the pandoc rule). Typed as the
/// closing `$` lands.
const INLINE_MATH_INPUT = /(?:^|[^\\$])\$([^\s$](?:[^$]*[^\s$])?)\$$/;

/// A formula inside running text, stored in the paragraph's markdown as `$…$`.
export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-latex") ?? "",
        renderHTML: (attributes: { latex?: string }) => ({ "data-latex": attributes.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-inline-math]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-inline-math": "" })];
  },
  renderText({ node }) {
    return `$${node.attrs.latex}$`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_INPUT,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          if (!latex) return;
          // The match can start one character early (the character before `$`).
          const start = range.from + match[0].indexOf("$");
          state.tr.replaceWith(start, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
});

function InlineMathView({
  node,
  updateAttributes,
  selected,
  editor,
  deleteNode,
}: ReactNodeViewProps) {
  // SAFETY: the node only ever writes `latex` as a string.
  const latex = node.attrs.latex as string;
  const ref = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState<string | null>(null);
  // A formula typed moments ago opens straight into editing when it's empty.
  const [editing, setEditing] = useState(latex === "");
  const [draft, setDraft] = useState(latex);

  useLayoutEffect(() => {
    if (ref.current) setError(latex ? renderMath(latex, ref.current, false) : null);
  }, [latex]);
  useEffect(() => {
    if (editing) setDraft(latex);
  }, [editing, latex]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() === "") deleteNode();
    else if (draft !== latex) updateAttributes({ latex: draft });
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper as="span">
      <Popover open={editing} onOpenChange={(open) => (open ? setEditing(true) : commit())}>
        <PopoverAnchor asChild>
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Formula ${latex}, click to edit`}
            onClick={() => editor.isEditable && setEditing(true)}
            className={cn(
              "inline-math",
              selected && "inline-math-selected",
              error && "text-destructive",
            )}
          >
            <span ref={ref} className={cn(error && "hidden")} />
            {(error || !latex) && <span className="font-mono text-xs">{latex || "$ $"}</span>}
          </span>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-80 p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraft(latex);
                setEditing(false);
                editor.commands.focus();
              }
            }}
            spellCheck={false}
            placeholder="\frac{a}{b}"
            aria-label="LaTeX"
            className="min-h-16 font-mono text-xs"
          />
          {error && <p className="mt-1.5 font-mono text-xs text-destructive">{error}</p>}
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
