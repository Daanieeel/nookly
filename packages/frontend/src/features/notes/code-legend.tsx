import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { Button } from "@nookly/ui/components/button";

/// A reminder of a block's code format, shown below the code: the essentials on one
/// line, the rest behind a toggle.
export function CodeLegend({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Eye = open ? IconEyeOff : IconEye;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate">{summary}</p>
        <Button
          variant="linkMuted"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="h-auto shrink-0 gap-1 self-center p-0 leading-none font-normal hover:no-underline"
        >
          <Eye className="size-3.5" />
          {open ? "Hide details" : "Show details"}
        </Button>
      </div>
      {open && children}
    </>
  );
}
