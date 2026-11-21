import type { Icon as TablerIcon } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { cn } from "@nookly/ui/lib/utils";

/// A good empty state names what's missing and gives the one action that fixes
/// it, right there — never a bare "no data" line. `compact` drops the box/icon
/// chip for small dashboard tiles where a framed box would be too heavy.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: TablerIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div className={cn("flex flex-col items-center gap-1.5 px-2 py-4 text-center", className)}>
        <Icon size={18} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center gap-5 overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center",
        className,
      )}
    >
      {/* A dot grid that fades out toward the edges, and a soft glow behind the icon. */}
      <div
        aria-hidden
        className="bg-dot-grid pointer-events-none absolute inset-0 -z-10 mask-radial-from-20% mask-radial-to-75%"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-8 left-1/2 -z-10 size-40 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      {/* The icon sits on a small stack of cards: two behind it, tilted, one in front. */}
      <div className="relative size-14" aria-hidden>
        <div className="absolute inset-0 -translate-x-1.5 -rotate-12 rounded-xl border bg-raised opacity-70 shadow-control" />
        <div className="absolute inset-0 translate-x-1.5 rotate-12 rounded-xl border bg-raised opacity-70 shadow-control" />
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border bg-raised text-foreground shadow-card">
          <Icon size={24} stroke={1.75} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
