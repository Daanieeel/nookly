import type { CSSProperties } from "react";
import type { Space } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";

/// A Space's color as a small dot.
export function SpaceDot({ space }: { space: Space }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full bg-(--space-color)"
      // SAFETY: `--space-color` only ever receives `space.color`, a plain hex string.
      style={{ "--space-color": space.color } as CSSProperties}
    />
  );
}

/// A Space as a color coded chip, on the cross-Space pages' rows and cards.
export function SpaceChip({ space, className }: { space: Space; className?: string }) {
  return (
    <span
      title={`Space: ${space.name}`}
      className={cn(
        "pointer-events-none relative flex max-w-40 shrink-0 items-center gap-1.5 rounded-md border border-(--space-color)/40 bg-(--space-color)/10 px-1.5 py-0.5 text-xs text-foreground",
        className,
      )}
      // SAFETY: `--space-color` only ever receives `space.color`, a plain hex string.
      style={{ "--space-color": space.color } as CSSProperties}
    >
      <SpaceDot space={space} />
      <span className="truncate">{space.name}</span>
    </span>
  );
}
