import type { ComponentProps } from "react";
import type { PopoverContent } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";

/// Props for a popover that opens from inside a dialog (the create dialogs' property
/// pills). Two things go wrong there without them:
/// - The dialog's scroll lock swallows wheel and touch moves from the portaled popover,
///   so its list can't scroll. They are kept inside the popover.
/// - In a small window the popover flips above its trigger and runs off the top. It is
///   capped to the room it has and scrolls instead.
export function dialogPopover(className?: string): ComponentProps<typeof PopoverContent> {
  return {
    className: cn(
      "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto",
      className,
    ),
    collisionPadding: 8,
    onWheel: (e) => e.stopPropagation(),
    onTouchMove: (e) => e.stopPropagation(),
  };
}
