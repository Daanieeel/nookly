import { IconFolder } from "@tabler/icons-react";
import type { CSSProperties } from "react";
import { renderIconValue } from "#/components/entity-icon.tsx";
import type { Space } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";

/// A Space's own icon (an emoji or a library icon) in its accent color, the one icon that
/// is not neutral. Without a chosen icon it is a folder.
export function SpaceIcon({
  space,
  size = 16,
  className,
}: {
  space: Space;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-(--space-size) shrink-0 items-center justify-center text-(--space-color)",
        className,
      )}
      // SAFETY: `--space-color` only ever receives `space.color`, a plain hex string, and
      // `--space-size` a pixel length — `CSSProperties` just doesn't model custom properties.
      style={{ "--space-color": space.color, "--space-size": `${size}px` } as CSSProperties}
    >
      {space.icon ? renderIconValue(space.icon, size) : <IconFolder size={size} />}
    </span>
  );
}
