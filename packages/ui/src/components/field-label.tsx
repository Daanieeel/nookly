import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@nookly/ui/lib/utils";

/// The small muted label above a form control. `Label` stays the regular sized one.
function FieldLabel({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="field-label"
      className={cn(
        "flex items-center gap-1 text-xs leading-none text-muted-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { FieldLabel };
