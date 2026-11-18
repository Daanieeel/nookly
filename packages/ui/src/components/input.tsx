import * as React from "react";

import { INPUT_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

function Input({ className, type, autoComplete = "off", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      data-slot="input"
      className={cn(INPUT_CLASSES, className)}
      {...props}
    />
  );
}

export { Input };
