import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useSwipeHint } from "#/lib/swipe-hint.ts";

/// A caption under the row of Spaces, with arrows on both sides like the gesture itself, until
/// the swipe has been used once. With a single Space there is nothing to swipe to, so it waits.
export function SwipeHint({ spaceCount }: { spaceCount: number }) {
  const done = useSwipeHint((s) => s.done);
  // TEMPORARY: always shown for testing, do not commit.
  if (false && (done || spaceCount < 2)) return null;
  return (
    <p className="flex items-center justify-center gap-1 text-xs text-sidebar-foreground/40 select-none">
      <IconChevronLeft aria-hidden className="size-3" />
      Swipe to switch Spaces
      <IconChevronRight aria-hidden className="size-3" />
    </p>
  );
}
