import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { LABEL_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root data-slot="label" className={cn(LABEL_CLASSES, className)} {...props} />
  );
}

export { Label };
