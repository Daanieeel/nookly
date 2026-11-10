import { IconAlertTriangle, IconCheck, IconLoader2 } from "@tabler/icons-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// In-place action feedback (docs/05-ui-ux-direction.md, "Success and Error Feedback"):
/// the control that was used shows pending, success and error itself; no toasts.

export type ActionStatus = "idle" | "pending" | "success" | "error";

/// Success reverts on its own; errors stay until the user acts again, unless the control asks
/// for them to revert too (`useActionStatus` with `revertErrors`), after `ERROR_REVERT_MS`.
export const SUCCESS_REVERT_MS = 2000;
export const ERROR_REVERT_MS = 5000;

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
/// With `revertErrors`, an error goes back to idle too, after `ERROR_REVERT_MS`, so a button
/// that failed becomes a plain button again instead of staying red.
export function useActionStatus(
  mutation: MutationLike,
  { revertErrors = false }: { revertErrors?: boolean } = {},
): ActionStatus {
  const { isSuccess, isError, reset } = mutation;
  useEffect(() => {
    const delay = isSuccess ? SUCCESS_REVERT_MS : isError && revertErrors ? ERROR_REVERT_MS : null;
    if (delay === null) return;
    const timer = setTimeout(reset, delay);
    return () => clearTimeout(timer);
  }, [isSuccess, isError, revertErrors, reset]);
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

/// Announces `message` to screen readers while there is one, and renders nothing otherwise.
/// An idle live region is never mounted: Radix hides everything outside an open dialog by
/// walking around every `[aria-live]` element on the page, so one per list row made each
/// dialog open and close write thousands of attributes. `<output>` is a polite live
/// region, and one inserted together with its text is announced.
export function StatusAnnouncer({ message }: { message: string | null }) {
  if (!message) return null;
  return <output className="sr-only">{message}</output>;
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
  pendingClassName,
}: {
  status: ActionStatus;
  icon?: ReactNode;
  label: ReactNode;
  successLabel?: string;
  errorLabel: string;
  /// Tints the spinner, e.g. to match a colored button; success and error keep their colors.
  pendingClassName?: string;
}) {
  const text =
    status === "success" && successLabel ? successLabel : status === "error" ? errorLabel : label;
  return (
    <>
      <StatusIcon
        status={status}
        idle={icon}
        className={status === "pending" ? pendingClassName : undefined}
      />
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
