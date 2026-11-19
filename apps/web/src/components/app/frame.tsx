import type { ReactNode } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// The desktop app's window, as it looks on a Mac: the traffic lights, a tab with the
/// page's icon and title, then the page itself on the card surface.
export function AppFrame({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-xl select-none",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-3 px-3">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-card px-2 text-xs shadow-xs">
          <span className="flex text-muted-foreground [&_svg]:size-3.5">{icon}</span>
          <span className="truncate">{title}</span>
        </span>
      </div>
      <div className="mx-1.5 mb-1.5 overflow-hidden rounded-lg border border-sidebar-border bg-card">
        {children}
      </div>
    </div>
  );
}
