import { IconAlertTriangle, IconCheck, IconLoader2 } from "@tabler/icons-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/// In-place action feedback (docs/05-ui-ux-direction.md, "Success and Error Feedback"):
/// the control that was used shows pending, success and error itself; no toasts.

export type ActionStatus = "idle" | "pending" | "success" | "error";

/// Success reverts on its own; errors stay until the user acts again.
export const SUCCESS_REVERT_MS = 2000;

interface MutationLike {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
}

export function statusOf(mutation: MutationLike): ActionStatus {
  if (mutation.isPending) return "pending";
  if (mutation.isSuccess) return "success";
  if (mutation.isError) return "error";
  return "idle";
}

/// Returns the mutation's status, resetting a success back to idle after `SUCCESS_REVERT_MS`.
export function useActionStatus(mutation: MutationLike): ActionStatus {
  const { isSuccess, reset } = mutation;
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(reset, SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, reset]);
  return statusOf(mutation);
}

/// Swaps `idle` for a spinner, green check or red warning, inside the same box.
export function StatusIcon({
  status,
  idle,
  size = 14,
  className,
}: {
  status: ActionStatus;
  idle: ReactNode;
  size?: number;
  className?: string;
}) {
  if (status === "pending") {
    return (
      <IconLoader2
        size={size}
        className={cn("shrink-0 animate-spin text-muted-foreground", className)}
      />
    );
  }
  if (status === "success") {
    return <IconCheck size={size} className={cn("shrink-0 text-positive", className)} />;
  }
  if (status === "error") {
    return <IconAlertTriangle size={size} className={cn("shrink-0 text-destructive", className)} />;
  }
  return idle;
}

/// Label color for a status; pair with `StatusIcon` so color is never the only signal.
export function statusTextClass(status: ActionStatus): string | undefined {
  if (status === "success") return "text-positive";
  if (status === "error") return "text-destructive";
  return undefined;
}

/// Always mounted so screen readers announce each change of `message`.
export function StatusAnnouncer({ message }: { message: string | null }) {
  return (
    <span className="sr-only" aria-live="polite">
      {message ?? ""}
    </span>
  );
}

/// Closes a dialog or menu as soon as `mutation` succeeds; the close itself is the
/// confirmation. Layout effect so no success state paints first. `close` can also
/// navigate or run follow-ups.
export function useCloseAfterSuccess(mutation: MutationLike, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const { isSuccess } = mutation;
  useLayoutEffect(() => {
    if (isSuccess) closeRef.current();
  }, [isSuccess]);
}

/// The inside of an action button: status icon, the label for the current status,
/// and a screen reader announcement. Keeps the button's box; only its content swaps.
export function StatusButtonContent({
  status,
  icon = null,
  label,
  successLabel,
  errorLabel,
}: {
  status: ActionStatus;
  icon?: ReactNode;
  label: ReactNode;
  successLabel?: string;
  errorLabel: string;
}) {
  const text =
    status === "success" && successLabel ? successLabel : status === "error" ? errorLabel : label;
  return (
    <>
      <StatusIcon status={status} idle={icon} />
      {text}
      <StatusAnnouncer
        message={
          status === "success" ? (successLabel ?? null) : status === "error" ? errorLabel : null
        }
      />
    </>
  );
}

/// Short error directly below a field (the one sanctioned place for extra lines).
/// Stays until the next attempt; `role="alert"` announces it.
export function FieldError({ message }: { message: string | null | false | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
      <IconAlertTriangle size={12} className="shrink-0" />
      {message}
    </p>
  );
}
