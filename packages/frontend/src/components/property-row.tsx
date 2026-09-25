import type { ReactNode } from "react";

/// A property's value in a detail sidebar: a full width, quiet button that opens
/// its picker.
export const PROPERTY_VALUE =
  "flex h-7 min-w-0 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent data-[state=open]:bg-accent";

/// One labelled row of Linear's properties panel.
export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-1">
      <span className="truncate px-2 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
