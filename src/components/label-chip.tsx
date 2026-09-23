import type { CSSProperties } from "react";
import type { Label } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/// The Label's stored color as a small dot, e.g. for filter options.
export function LabelDot({ label }: { label: Label }) {
  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-(--label-color)"
      // SAFETY: `--label-color` only ever receives `label.color`, a plain hex string
      // from the labels API; `CSSProperties` just doesn't model custom properties.
      style={{ "--label-color": label.color } as CSSProperties}
    />
  );
}

/// A Space Label as a small quiet chip: the stored color lives in the dot only, so a
/// row of chips never outshouts the content next to it.
export function LabelChip({ label, className }: { label: Label; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-32 items-center gap-1 rounded-sm border border-border px-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <LabelDot label={label} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}
