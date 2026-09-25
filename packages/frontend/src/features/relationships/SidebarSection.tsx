import type { ReactNode } from "react";

/// One right sidebar section (§1.5): a muted leading icon so the four sections read
/// apart at a glance, the title, and a count once there's something to count.
export function SidebarSection({
  icon,
  title,
  count = 0,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  /// Header-level control, right aligned (e.g. an edit button).
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-6 items-center gap-1.5 px-2 text-muted-foreground">
        <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
        <p className="text-xs font-medium">{title}</p>
        {count > 0 && <span className="text-xs tabular-nums opacity-60">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/// Empty state for a content-driven section with no action to offer: says how it
/// fills up, quieter than a populated row.
export function SidebarHint({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1 text-xs text-muted-foreground/70">{children}</p>;
}
