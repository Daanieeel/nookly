import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useLayoutEffect } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "@/components/action-feedback";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/// Resolve `false` when the user backed out (e.g. cancelled a native save dialog):
/// the item returns to rest instead of showing success.
export type MenuAction = () => Promise<boolean | undefined | void>;

/// A menu item that keeps its menu open while `action` runs, then calls `onDone`
/// (close the menu) the moment it succeeds; closing is the confirmation. On error
/// it stays open with `errorLabel` until the user tries again.
export function FeedbackMenuItem({
  icon,
  label,
  successLabel,
  errorLabel,
  action,
  onDone,
}: {
  icon: ReactNode;
  label: ReactNode;
  successLabel: string;
  errorLabel: string;
  action: MenuAction;
  onDone: () => void;
}) {
  const run = useMutation({ mutationFn: action });
  const status = statusOf(run);
  const backedOut = run.isSuccess && run.data === false;

  useLayoutEffect(() => {
    if (!run.isSuccess) return;
    if (backedOut) run.reset();
    else onDone();
  }, [run.isSuccess, backedOut, run.reset, onDone]);

  const shown = backedOut ? "idle" : status;
  const announcement = shown === "success" ? successLabel : shown === "error" ? errorLabel : null;

  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        if (!run.isPending) run.mutate();
      }}
    >
      <StatusIcon status={shown} idle={icon} />
      <span className={statusTextClass(shown)}>
        {shown === "success" ? successLabel : shown === "error" ? errorLabel : label}
      </span>
      <StatusAnnouncer message={announcement} />
    </DropdownMenuItem>
  );
}
