import { IconCircleOff } from "@tabler/icons-react";
import { TextSelection } from "@tiptap/pm/state";
import { type Editor, useEditorState } from "@tiptap/react";
import { type CSSProperties, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { useMeasureOnTransaction } from "./drag-overlays";
import { textColorOfSelection } from "./text-color-extension";
import { TEXT_COLORS, type TextColorId } from "./text-colors";

interface Spot {
  top: number;
  left: number;
  /// The colour the whole selection has, null when it has none or several.
  color: TextColorId | null;
}

/// A bar of colours below the selected text, to colour it. The colour is stored in the page
/// only; a markdown export leaves it out. Below, so it never covers the highlight colour bar
/// that sits above.
export function TextColorBar({ editor }: { editor: Editor | null }) {
  const [spot, setSpot] = useState<Spot | null>(null);
  // A page that is locked while the bar is up takes it away without a selection change.
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isEditable ?? false,
  });

  // Measured once per frame after a change, like the highlight colour bar.
  useMeasureOnTransaction(editor, () => {
    const { selection } = editor?.state ?? {};
    const type = editor?.state.schema.marks.textColor;
    const shown =
      editor &&
      editor.isEditable &&
      type &&
      selection instanceof TextSelection &&
      !selection.empty &&
      selection.$from.parent.type.allowsMarkType(type);
    if (!editor || !shown) {
      setSpot((previous) => (previous === null ? previous : null));
      return;
    }
    const color = textColorOfSelection(editor.state);
    let top = 0;
    let left = 0;
    try {
      const end = editor.view.coordsAtPos(editor.state.selection.to);
      const box = editor.view.dom.getBoundingClientRect();
      top = end.bottom - box.top;
      left = end.left - box.left;
    } catch {
      // No layout to measure (a test): the bar stays at the corner.
    }
    setSpot((previous) =>
      previous && previous.top === top && previous.left === left && previous.color === color
        ? previous
        : { top, left, color },
    );
  });

  if (!editor || !spot || !editable) return null;
  return (
    <div
      role="toolbar"
      aria-label="Text color"
      // Clicking a colour must not take the selection out of the text.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute top-(--bar-top) left-(--bar-left) z-10 flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-sm"
      // SAFETY: pixel lengths measured from the selection, which `CSSProperties` can't name.
      style={
        {
          "--bar-top": `${spot.top + 6}px`,
          "--bar-left": `${Math.max(0, spot.left - 12)}px`,
        } as CSSProperties
      }
    >
      {TEXT_COLORS.map((color) => (
        <Tooltip key={color.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={color.label}
              aria-pressed={spot.color === color.id}
              onClick={() => editor.commands.setTextColor(color.id)}
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Remove color"
            onClick={() => editor.commands.unsetTextColor()}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconCircleOff size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove color</TooltipContent>
      </Tooltip>
    </div>
  );
}
