import type { ReactNode } from "react";
import { PROPERTY_VALUE } from "#/classes.ts";

/// A property's value in a detail sidebar: a full width, quiet button that opens
/// its picker.
export { PROPERTY_VALUE };

/// One labelled row of Linear's properties panel.
export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-1">
      <span className="truncate px-2 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
