import { IconX } from "@tabler/icons-react";
import { useSonner } from "sonner";
import { Button } from "@nookly/ui/components/button";
import { Toaster } from "@nookly/ui/components/sonner";
import { notify } from "#/components/notify.tsx";

/// The stack sits above the Clear all bar: its height (about 2.25rem) and a gap.
const OFFSET_WITH_CLEAR = 60;
const OFFSET = 16;

/// The app's toasts: each has a close button, and once more than one is showing a bar
/// under the stack says how many there are and clears them all, like the notifications on
/// iOS. The bar is drawn like a toast (same surface, width and corner) so it reads as part
/// of the stack, not a button floating over the page.
export function AppToaster() {
  const { toasts } = useSonner();
  const count = toasts.length;
  return (
    <>
      <Toaster closeButton offset={count > 1 ? OFFSET_WITH_CLEAR : OFFSET} />
      {count > 1 && (
        <div
          data-toast-clear
          className="fixed right-4 bottom-4 z-100 flex h-9 w-[min(356px,calc(100vw-2rem))] items-center justify-between gap-2 rounded-2xl border border-border bg-popover py-1 pr-1 pl-3.5 text-xs text-popover-foreground shadow-lg"
        >
          <span className="text-muted-foreground tabular-nums">{count} notifications</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => notify.dismiss()}
          >
            <IconX size={12} />
            Clear all
          </Button>
        </div>
      )}
    </>
  );
}
