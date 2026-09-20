import type { Icon as TablerIcon } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/// A good empty state names what's missing and gives the one action that fixes
/// it, right there — never a bare "no data" line. `compact` drops the box/icon
/// chip for small dashboard tiles where a dashed border would be too heavy.
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
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={18} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
