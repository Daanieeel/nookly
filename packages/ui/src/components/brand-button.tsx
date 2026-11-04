import * as React from "react";

import { cn } from "@nookly/ui/lib/utils";
import { buttonVariants } from "./button";

/// A large, white button that carries another service's mark, for signing in with it. It looks
/// the same in both themes, as such buttons do everywhere. Put the mark in as the first child.
function BrandButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="brand-button"
      className={cn(
        buttonVariants({ variant: "secondary" }),
        "h-12 w-full border-brand-button-border bg-brand-button text-base text-brand-button-foreground shadow-sm hover:bg-brand-button/90 hover:text-brand-button-foreground [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

export { BrandButton };
