import { IconX } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";

/// The small X in the corner of a sidebar card that closes it for good. `label` says
/// which card, for screen readers.
export function CardDismissButton({ label, onDismiss }: { label: string; onDismiss: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onDismiss}
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">Dismiss</TooltipContent>
    </Tooltip>
  );
}
