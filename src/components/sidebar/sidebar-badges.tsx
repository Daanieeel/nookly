import { differenceInCalendarDays, format } from "date-fns";
import type { CSSProperties } from "react";

export function SidebarCountBadge({
  count,
  accent = false,
  accentColor,
}: {
  count: number;
  accent?: boolean;
  accentColor?: string;
}) {
  if (count <= 0) return null;
  return (
    <span className="relative flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-sidebar-accent px-1 text-xs text-sidebar-foreground/70 tabular-nums">
      {count}
      {accent && (
        <span
          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-(--dot-color)"
          // SAFETY: `--dot-color` only ever receives a plain hex string (Space accent
          // color) or the `--destructive` token reference — `CSSProperties` just
          // doesn't model custom properties.
          style={{ "--dot-color": accentColor ?? "var(--destructive)" } as CSSProperties}
        />
      )}
    </span>
  );
}

export function SidebarUrgencyChip({ date }: { date: string }) {
  const target = new Date(date);
  const days = differenceInCalendarDays(target, new Date());
  const label = days <= 7 ? `${Math.max(days, 0)}d` : format(target, "MMM d");
  return <span className="shrink-0 text-xs text-sidebar-foreground/60">{label}</span>;
}
