import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
