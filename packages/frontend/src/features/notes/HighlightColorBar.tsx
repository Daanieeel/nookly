import type { Editor } from "@tiptap/react";
import { type CSSProperties, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { useMeasureOnTransaction } from "./drag-overlays";
import { HIGHLIGHT_COLORS, parseHighlightColor } from "./highlight-colors";

interface Spot {
  top: number;
  left: number;
  /// The colour of the highlight under the caret; yellow is the default.
  color: string;
}

/// A bar of colours above the caret while it is in a highlight, to colour that highlight.
/// The colour is stored in the page only; a markdown export leaves it out.
export function HighlightColorBar({ editor }: { editor: Editor | null }) {
  const [spot, setSpot] = useState<Spot | null>(null);

  // Measured once per frame after a change, like the table controls.
  useMeasureOnTransaction(editor, () => {
    if (!editor || !editor.isEditable || !editor.isActive("highlight")) {
      setSpot((previous) => (previous === null ? previous : null));
      return;
    }
    const color = parseHighlightColor(editor.getAttributes("highlight").color) ?? "yellow";
    let top = 0;
    let left = 0;
    try {
      const caret = editor.view.coordsAtPos(editor.state.selection.from);
      const box = editor.view.dom.getBoundingClientRect();
      top = caret.top - box.top;
      left = caret.left - box.left;
    } catch {
      // No layout to measure (a test): the bar stays at the corner.
    }
    setSpot((previous) =>
      previous && previous.top === top && previous.left === left && previous.color === color
        ? previous
        : { top, left, color },
    );
  });

  if (!editor || !spot) return null;
  return (
    <div
      role="toolbar"
      aria-label="Highlight colour"
      // Clicking a colour must not take the caret out of the highlight.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute top-(--bar-top) left-(--bar-left) z-10 flex -translate-y-full items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-sm"
      // SAFETY: pixel lengths measured from the caret, which `CSSProperties` can't name.
      style={
        {
          "--bar-top": `${spot.top - 6}px`,
          "--bar-left": `${Math.max(0, spot.left - 12)}px`,
        } as CSSProperties
      }
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <Tooltip key={color.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={color.label}
              aria-pressed={spot.color === color.id}
              onClick={() => editor.commands.setHighlightColor(color.id)}
              className={cn(
                "size-5 rounded-full border border-black/10 bg-(--swatch) outline-none focus-visible:ring-2 focus-visible:ring-ring",
                spot.color === color.id &&
                  "ring-2 ring-foreground/60 ring-offset-1 ring-offset-popover",
              )}
              // SAFETY: a colour from the fixed palette, which `CSSProperties` can't name.
              style={{ "--swatch": color.swatch } as CSSProperties}
            />
          </TooltipTrigger>
          <TooltipContent>{color.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
