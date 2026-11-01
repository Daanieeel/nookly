import { IconArrowsHorizontal } from "@tabler/icons-react";
import { useSwipeHint } from "#/lib/swipe-hint.ts";

/// A quiet line above the row of Spaces that tells about the two finger swipe, until the
/// swipe has been used once. With a single Space there is nothing to swipe to, so it waits.
export function SwipeHint({ spaceCount }: { spaceCount: number }) {
  const done = useSwipeHint((s) => s.done);
  if (done || spaceCount < 2) return null;
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs text-sidebar-foreground/50">
      <IconArrowsHorizontal aria-hidden className="size-3.5 shrink-0" />
      Swipe sideways with two fingers to switch Spaces
    </p>
  );
}
