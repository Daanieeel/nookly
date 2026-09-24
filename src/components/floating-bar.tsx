import type { FormEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

/// The composer floating at the bottom of a list page, like the URL field on
/// Bookmarks and Files. The page's scroll area needs `pb-24` so its last row
/// can scroll clear of it.
export function FloatingBar({
  onSubmit,
  failed = false,
  className,
  children,
}: {
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /// Marks the whole bar after a failed submit.
  failed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
      className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4"
    >
      <div
        className={cn(
          "pointer-events-auto flex min-h-11 w-full max-w-lg items-center gap-2 rounded-xl border border-border bg-popover py-1.5 pr-1.5 pl-3 shadow-lg transition-colors focus-within:border-foreground/30",
          failed && "border-destructive/60",
          className,
        )}
      >
        {children}
      </div>
    </form>
  );
}

/// The bare text field inside a `FloatingBar`; the bar is its visible box.
export const FLOATING_BAR_INPUT =
  "h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground";
