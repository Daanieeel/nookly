import type { ReactNode } from "react";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { SHORTCUT_META, displayText } from "#/lib/shortcuts.ts";
import {
  cancelPendingShortcut,
  confirmPendingShortcut,
  usePendingShortcut,
} from "./shortcut-editing.ts";

function Chip({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{children}</code>;
}

/// Asks before a key moves from one shortcut to another. Double assignment is never
/// allowed, so the answer is either to move it (the other shortcut ends up with no key)
/// or to leave both exactly as they were.
export function ShortcutConflictDialog() {
  const pending = usePendingShortcut((s) => s.pending);
  const keys = pending ? displayText(pending.hotkey) : "";
  const target = pending ? SHORTCUT_META[pending.name].title : "";
  const other = pending ? SHORTCUT_META[pending.other].title : "";
  return (
    <ConfirmPermanentDialog
      open={pending !== null}
      onOpenChange={(open) => !open && cancelPendingShortcut()}
      title={
        <>
          Reassign <Chip>{keys}</Chip> to <Chip>{target}</Chip>?
        </>
      }
      description={
        <>
          <Chip>{keys}</Chip> is used by <Chip>{other}</Chip> right now. If you reassign it,{" "}
          <Chip>{target}</Chip> gets <Chip>{keys}</Chip> and <Chip>{other}</Chip> has no shortcut
          until you give it one. Nothing is lost: you can assign <Chip>{other}</Chip> a new key at
          any time.
        </>
      }
      actionLabel="Reassign"
      errorLabel="Couldn't reassign, try again"
      status="idle"
      onConfirm={confirmPendingShortcut}
    />
  );
}
