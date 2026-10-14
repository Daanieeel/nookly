import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { SEPARATOR_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(SEPARATOR_CLASSES, className)}
      {...props}
    />
  );
}

export { Separator };
