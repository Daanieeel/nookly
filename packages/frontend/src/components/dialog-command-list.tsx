import type { ComponentProps } from "react";
import { CommandList } from "@nookly/ui/components/command";

/// The scrolling list of a searchable popover: every option stays reachable by scrolling
/// while the search box above it stays put. Capped to 16rem, or to the room the popover
/// has in a short window (the variable is unset outside a popover, so it falls back).
export function DialogCommandList(props: ComponentProps<typeof CommandList>) {
  return (
    <CommandList
      className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height,100vh)-3rem))] p-1"
      {...props}
    />
  );
}
