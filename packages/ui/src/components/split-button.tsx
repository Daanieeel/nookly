import * as React from "react";

import { cn } from "@nookly/ui/lib/utils";

/// Two or more Buttons joined into one: the main action, then a chevron that opens the
/// other choices. Only the outer corners stay round, and a thin line parts the halves.
function SplitButton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="split-button"
      className={cn(
        "inline-flex items-stretch",
        "*:data-[slot=button]:rounded-none *:data-[slot=button]:first:rounded-l-md *:data-[slot=button]:last:rounded-r-md",
        "*:data-[slot=button]:not-first:border-l *:data-[slot=button]:not-first:border-current/25",
        className,
      )}
      {...props}
    />
  );
}

export { SplitButton };
