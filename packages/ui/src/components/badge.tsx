import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@nookly/ui/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        primary: "bg-primary/10 border border-primary/50 text-primary",
        secondary: "border-transparent bg-accent text-accent-foreground",
        outline: "border-foreground/50 text-foreground",
        ghost: "border-transparent bg-transparent text-foreground",
        positive: "bg-positive/10 border border-positive/50 text-positive",
        warning: "bg-warning/10 border border-warning/50 text-warning",
        destructive: "bg-destructive/10 border border-destructive/50 text-destructive",
      },
      size: {
        sm: "px-1 py-0.5 text-[11px]",
        md: "px-1.5 py-0.5 text-xs",
        lg: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  },
);

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
