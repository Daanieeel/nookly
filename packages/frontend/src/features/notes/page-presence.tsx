import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import type { Present } from "#/lib/presence.ts";

export function PresenceBar({ present }: { present: Present[] }) {
  if (present.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Also on this page"
      className="pointer-events-auto sticky top-0 z-10 float-right flex items-center -space-x-1.5"
    >
      {present.slice(0, 5).map((person) => (
        <Tooltip key={person.clientId}>
          <TooltipTrigger asChild>
            <span
              aria-label={person.name}
              className="flex size-6 items-center justify-center rounded-md border-2 border-background bg-(--presence) text-xs font-semibold text-white uppercase"
              // SAFETY: `--presence` only ever receives a hex color from `caretColor`.
              style={{ "--presence": person.color } as React.CSSProperties}
            >
              {person.name.slice(0, 1)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{person.name} is here</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
