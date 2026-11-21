import * as React from "react";

import { TRAY_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

/// A soft frame around one raised thing, like a bezel. Put a raised element inside it:
/// a field, a card or a banner.
function Tray({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="tray" className={cn(TRAY_CLASSES, className)} {...props} />;
}

export { Tray };
