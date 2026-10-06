import { IconAlertTriangle } from "@tabler/icons-react";
import { Selection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// What a block's own editing view is given: the stored drawing, the block's code
/// and a way to save a new drawing.
export interface InteractiveProps {
  drawing: string;
  source: string;
  onChange: (drawing: string) => void;
}

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
  /// Tooltip and name of a button that copies the code, shown in every view.
  copyLabel?: string;
  /// A third view between the code and the preview, where the block is edited by
  /// hand. It keeps its work in a `drawing` attr.
  interactive?: ComponentType<InteractiveProps>;
}

type View = "source" | "interactive" | "rendered";

function viewLabel(view: View, sourceLabel: string): string {
  if (view === "source") return sourceLabel;
  return view === "interactive" ? "Interactive" : "Preview";
}

/// Whether the app shows its dark theme right now, following theme switches.
function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
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
  const Interactive = options.interactive;
  const views: View[] = Interactive
    ? ["source", "interactive", "rendered"]
    : ["source", "rendered"];
  // SAFETY: the attr is one of the views, or something stored by a newer version.
  const view = views.includes(node.attrs.view) ? (node.attrs.view as View) : "source";
  const rendered = view === "rendered";
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

  const show = (next: View) => {
    if (next === view) return;
    updateAttributes({ view: next });
    const pos = getPos();
    if (pos === undefined) return;
    // The code is hidden unless it is shown, so the cursor moves out of it; editing
    // puts it back at the end of the code.
    const { state } = editor.view;
    const hidden = next !== "source";
    const target = hidden ? pos + node.nodeSize : pos + node.nodeSize - 1;
    const selection = Selection.near(state.doc.resolve(target), hidden ? 1 : -1);
    editor.view.dispatch(state.tr.setSelection(selection));
    editor.view.focus();
  };

  return (
    <NodeViewWrapper className="source-block my-1" data-view={view}>
      <div className="code-block-header" contentEditable={false}>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{options.label}</span>
        </span>
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          {options.copyLabel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <CopyButton
                  value={source}
                  aria-label={options.copyLabel}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                />
              </TooltipTrigger>
              <TooltipContent>{options.copyLabel}</TooltipContent>
            </Tooltip>
          )}
          <fieldset aria-label="View" className="flex min-w-0 shrink-0 items-center gap-0.5">
            {views.map((name) => (
              <Button
                key={name}
                variant={name === view ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={name === view}
                onClick={() => show(name)}
                className="h-6 px-2"
              >
                {viewLabel(name, options.sourceLabel)}
              </Button>
            ))}
          </fieldset>
        </div>
      </div>
      <pre className="code-block-body" hidden={view !== "source"}>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {Interactive && view === "interactive" && (
        <div contentEditable={false} className="source-block-preview">
          <Interactive
            drawing={String(node.attrs.drawing ?? "")}
            source={source}
            onChange={(drawing) => updateAttributes({ drawing })}
          />
        </div>
      )}
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
