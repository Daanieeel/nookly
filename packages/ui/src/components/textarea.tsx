import * as React from "react";

import { TEXTAREA_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

function Textarea({ className, autoComplete = "off", ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      autoComplete={autoComplete}
      data-slot="textarea"
      className={cn(TEXTAREA_CLASSES, className)}
      {...props}
    />
  );
}

export { Textarea };
