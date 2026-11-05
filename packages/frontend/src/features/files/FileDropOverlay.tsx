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
      {/* Sticky, so on a page taller than the screen the label stays in view. */}
      <div className="sticky top-1/3 flex flex-col items-center gap-2">
        <IconFileUpload size={32} className="text-primary" />
        {label}
      </div>
    </div>
  );
}
