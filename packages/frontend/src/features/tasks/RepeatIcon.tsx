import { IconRepeat } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import type { Task } from "#/lib/api/types.ts";
import { repeatLabel } from "./task-repeat.ts";

/// A small repeat glyph for a task that repeats, saying how often. Nothing otherwise.
export function RepeatIcon({ task }: { task: Task }) {
  if (!task.repeat) return null;
  const label = `Repeats ${repeatLabel(task.repeat).toLowerCase()}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconRepeat
          size={12}
          role="img"
          aria-label={label}
          className="pointer-events-auto relative shrink-0 text-muted-foreground"
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
