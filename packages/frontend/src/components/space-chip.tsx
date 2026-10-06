import type { CSSProperties } from "react";
import type { Space } from "#/lib/api/types.ts";
import { IconFolder } from "@tabler/icons-react";
import { renderIconValue } from "#/components/entity-icon.tsx";
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

/// A Space's own icon (a folder without one) in its color. The color sits on the icon
/// itself too: a select's styles gray out any icon without a `text-` class of its own.
export function SpaceIcon({ space, size = 14 }: { space: Space; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center text-(--space-color)"
      // SAFETY: `--space-color` only ever receives `space.color`, a plain hex string.
      style={{ "--space-color": space.color } as CSSProperties}
    >
      {space.icon ? (
        renderIconValue(space.icon, size, "text-(--space-color)")
      ) : (
        <IconFolder size={size} className="text-(--space-color)" />
      )}
    </span>
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
