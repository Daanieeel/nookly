import { CopyButton } from "@/components/ui/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/// An entity's `TSK-14` key as quiet monospace text, for list rows and pickers.
export function EntityKey({ entityKey, className }: { entityKey: string; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums",
        className,
      )}
    >
      {entityKey}
    </span>
  );
}

/// The key in a page header, copied on click. The copy icon swaps to a check as the
/// in place confirmation.
export function EntityKeyCopy({ entityKey }: { entityKey: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CopyButton
          value={entityKey}
          aria-label={`Copy ID ${entityKey}`}
          iconClassName="size-3"
          className="flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground"
        >
          {entityKey}
        </CopyButton>
      </TooltipTrigger>
      <TooltipContent>Copy ID</TooltipContent>
    </Tooltip>
  );
}
