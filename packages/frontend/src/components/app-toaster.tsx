import { IconX } from "@tabler/icons-react";
import { useSonner } from "sonner";
import { Button } from "@nookly/ui/components/button";
import { Toaster } from "@nookly/ui/components/sonner";
import { notify } from "#/components/notify.tsx";

/// Room under the stack for the Clear all button.
const OFFSET_WITH_CLEAR = 56;
const OFFSET = 16;

/// The app's toasts: each has a close button, and once more than one is showing a Clear
/// all button appears under the stack, like the notifications on iOS.
export function AppToaster() {
  const { toasts } = useSonner();
  const many = toasts.length > 1;
  return (
    <>
      <Toaster closeButton offset={many ? OFFSET_WITH_CLEAR : OFFSET} />
      {many && (
        <div className="fixed right-4 bottom-4 z-100">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => notify.dismiss()}
          >
            <IconX size={14} />
            Clear all
          </Button>
        </div>
      )}
    </>
  );
}
