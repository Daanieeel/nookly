import { CheckIcon, CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type * as React from "react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@nookly/ui/lib/utils";

function Toaster({ theme = "system", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="group"
      style={
        // SAFETY: these are CSS custom properties (not standard style props), which
        // `React.CSSProperties` doesn't model; consumed via `var(...)` in styles.css.
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { title: "whitespace-pre-line" } }}
      {...props}
    />
  );
}

/// The kinds of toast. Each has its own icon and color, so a toast is never told apart by
/// color alone: success is a check, an error and a warning are triangles (in the
/// destructive and the warning color), a caution is a circle with an exclamation mark, and
/// info is a circled i.
export type ToastVariant = "success" | "error" | "warning" | "caution" | "info";

const VARIANTS = {
  success: { Icon: CheckIcon, color: "text-positive" },
  error: { Icon: TriangleAlertIcon, color: "text-destructive" },
  warning: { Icon: TriangleAlertIcon, color: "text-warning" },
  caution: { Icon: CircleAlertIcon, color: "text-caution" },
  info: { Icon: InfoIcon, color: "text-muted-foreground" },
} satisfies Record<ToastVariant, { Icon: typeof CheckIcon; color: string }>;

/// How long a toast stays: every kind but an error closes after this, pausing while the
/// pointer is on it. A failure that vanishes is worse than none, so an error stays until
/// it is closed.
export const TOAST_DURATION_MS = 5000;

export interface ToastOptions {
  /// A second, smaller line under the message.
  description?: string;
  /// Something under the message, such as a link to what the toast is about. Gets a
  /// function that closes this toast.
  footer?: (dismiss: () => void) => React.ReactNode;
  /// A button on the toast, such as Undo.
  action?: { label: string; onClick: () => void };
}

function ToastContent({
  variant,
  message,
  description,
  footer,
}: {
  variant: ToastVariant;
  message: string;
  description: string | undefined;
  footer: React.ReactNode;
}) {
  const { Icon, color } = VARIANTS[variant];
  return (
    // An error is announced at once, everything else politely.
    <div role={variant === "error" ? "alert" : "status"} className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-start gap-2">
        <Icon aria-hidden size={16} className={cn("mt-0.5 shrink-0", color)} />
        {message}
      </span>
      {description && <span className="pl-6 text-xs text-muted-foreground">{description}</span>}
      {footer}
    </div>
  );
}

/// Shows a toast of the given kind and returns its id. The icon sits on the message's line
/// inside the content (Sonner's own icon column is not used), so a description or a footer
/// can use the full width.
export function showToast(
  variant: ToastVariant,
  message: string,
  { description, footer, action }: ToastOptions = {},
): string | number {
  // The id exists only once the toast does; the footer closes it through this.
  let id: string | number = "";
  const dismiss = () => toast.dismiss(id);
  id = toast(
    <ToastContent
      variant={variant}
      message={message}
      description={description}
      footer={footer?.(dismiss)}
    />,
    { action, duration: variant === "error" ? Number.POSITIVE_INFINITY : TOAST_DURATION_MS },
  );
  return id;
}

/// Closes one toast, or every toast when no id is given.
export function dismissToast(id?: string | number): void {
  toast.dismiss(id);
}

export { Toaster };
