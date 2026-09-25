import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@nookly/ui/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive/10 text-destructive border border-destructive/50 hover:bg-destructive/30",
        warning: "bg-warning/10 text-warning border border-warning/50 hover:bg-warning/30",
        caution: "bg-caution/10 text-caution border border-caution/50 hover:bg-caution/30",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        positive: "bg-positive/10 border border-positive text-positive hover:bg-positive/30",
        neutral:
          "bg-muted-foreground/20 border border-muted-foreground text-white hover:bg-muted-foreground/40",
        secondary: "border border-input bg-accent hover:bg-accent/80 hover:text-accent-foreground",
        ghost: "hover:bg-black/5 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        linkMuted: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "size-9",
        iconSm: "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
