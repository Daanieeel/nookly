import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { FIELD_LABEL_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

/// The small muted label above a form control. `Label` stays the regular sized one.
function FieldLabel({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="field-label"
      className={cn(FIELD_LABEL_CLASSES, className)}
      {...props}
    />
  );
}

export { FieldLabel };
