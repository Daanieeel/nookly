import { IconAlertTriangle } from "@tabler/icons-react";
import { Selection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SourceBlockOptions {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /// Name of the source language on the toggle ("LaTeX", "Mermaid").
  sourceLabel: string;
  /// What the empty block's preview says instead.
  emptyLabel: string;
  /// Draws `source` into `element`, resolving to an error message or `null`.
  render: (source: string, element: HTMLElement, dark: boolean) => Promise<string | null>;
  /// Center the preview, for a single display equation.
  centered: boolean;
}

/// Whether the app shows its dark theme right now, following theme switches.
function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/// A code block that can also show what its code draws: LaTeX as a formula,
/// Mermaid as a diagram. The `view` attr (`source` / `rendered`) picks the side;
/// the code stays in the document either way, so switching loses nothing.
export function SourceBlock({
  node,
  updateAttributes,
  extension,
  editor,
  getPos,
}: ReactNodeViewProps) {
  // SAFETY: every node rendering this view is created with `SourceBlockOptions`
  // (`source-block-extensions.ts`).
  const options = extension.options as SourceBlockOptions;
  const Icon = options.icon;
  const rendered = node.attrs.view === "rendered";
  const source = node.textContent;
  const dark = useIsDark();
  const previewRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = previewRef.current;
    if (!rendered || !element || !source.trim()) return;
    let cancelled = false;
    void options.render(source, element, dark).then((message) => {
      if (!cancelled) setError(message);
    });
    return () => {
      cancelled = true;
    };
  }, [rendered, source, dark, options]);

  const show = (view: "source" | "rendered") => {
    if ((view === "rendered") === rendered) return;
    updateAttributes({ view });
    const pos = getPos();
    if (pos === undefined) return;
    // The code is hidden while rendered, so the cursor moves out of it; editing
    // puts it back at the end of the code.
    const { state } = editor.view;
    const target = view === "rendered" ? pos + node.nodeSize : pos + node.nodeSize - 1;
    const selection = Selection.near(state.doc.resolve(target), view === "rendered" ? 1 : -1);
    editor.view.dispatch(state.tr.setSelection(selection));
    editor.view.focus();
  };

  return (
    <NodeViewWrapper className="source-block my-1" data-view={rendered ? "rendered" : "source"}>
      <div className="code-block-header" contentEditable={false}>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{options.label}</span>
        </span>
        <div role="group" aria-label="View" className="flex shrink-0 items-center gap-0.5">
          {(["source", "rendered"] as const).map((view) => (
            <Button
              key={view}
              variant={(view === "rendered") === rendered ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={(view === "rendered") === rendered}
              onClick={() => show(view)}
              className="h-6 px-2"
            >
              {view === "source" ? options.sourceLabel : "Preview"}
            </Button>
          ))}
        </div>
      </div>
      <pre className="code-block-body" hidden={rendered}>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {rendered && (
        <div
          contentEditable={false}
          onDoubleClick={() => show("source")}
          className={cn(
            "source-block-preview",
            options.centered && "justify-center text-center",
            error && "hidden",
          )}
        >
          {source.trim() ? (
            <div
              ref={previewRef}
              className="w-full min-w-0 overflow-x-auto overflow-y-hidden py-1"
            />
          ) : (
            <span className="text-sm text-muted-foreground">{options.emptyLabel}</span>
          )}
        </div>
      )}
      {rendered && error && (
        <div
          contentEditable={false}
          onDoubleClick={() => show("source")}
          className="source-block-preview items-start gap-2 text-xs"
        >
          <IconAlertTriangle className="size-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 font-mono wrap-break-word text-destructive">{error}</span>
        </div>
      )}
    </NodeViewWrapper>
  );
}
