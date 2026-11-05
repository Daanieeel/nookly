import type { CSSProperties } from "react";
import { IconFileUpload } from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";

/// Covers an area while a file is dragged over it, so it is clear what dropping does. It never
/// takes the pointer, so the drop lands on the area below. The area must be `relative`.
export function FileDropOverlay({ label, className }: { label: string; className?: string }) {
  return (
    <div
      data-testid="file-drop-overlay"
      className={cn(
        "pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/80 px-3 text-center text-sm font-medium backdrop-blur-sm",
        className,
      )}
    >
      <IconFileUpload size={32} className="text-primary" />
      {label}
    </div>
  );
}

/// Where in a page a dropped file will land: pixels from the page's top left, and its width.
export interface DropSlot {
  top: number;
  left: number;
  width: number;
}

/// A dashed box at the spot a dropped file will be placed, centered on the line that marks it.
export function FileDropSlot({ slot, label }: { slot: DropSlot; label: string }) {
  return (
    <div
      data-testid="file-drop-slot"
      className="pointer-events-none absolute top-(--slot-top) left-(--slot-left) z-50 flex h-14 w-(--slot-width) -translate-y-1/2 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium backdrop-blur-sm"
      // SAFETY: pixel lengths read from the drop cursor's own box.
      style={
        {
          "--slot-top": `${slot.top}px`,
          "--slot-left": `${slot.left}px`,
          "--slot-width": `${slot.width}px`,
        } as CSSProperties
      }
    >
      <IconFileUpload size={20} className="text-primary" />
      {label}
    </div>
  );
}
