import type { ComponentProps } from "react";
import type { PopoverContent } from "@nookly/ui/components/popover";

/// Props for a popover that opens from inside a dialog (the create dialogs' property
/// pills). Without them its list can't scroll: the dialog's scroll lock swallows wheel
/// and touch moves from a portaled popover, so they are kept inside it. The padding
/// keeps it off the window's edge.
export function dialogPopover(className?: string): ComponentProps<typeof PopoverContent> {
  return {
    className,
    collisionPadding: 8,
    onWheel: (e) => e.stopPropagation(),
    onTouchMove: (e) => e.stopPropagation(),
  };
}
