import { IconX } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { StatusAnnouncer, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// Hover X for a linked row. Success removes the row itself; pending and errors
/// stay visible on the X (not only on hover) until the next attempt.
export function RemoveLinkButton({
  label,
  errorLabel,
  onRemove,
}: {
  label: string;
  errorLabel: string;
  onRemove: () => Promise<void>;
}) {
  const remove = useMutation({ mutationFn: onRemove });
  const status = statusOf(remove);
  const busy = status === "pending" || status === "error";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={status === "error" ? errorLabel : label}
          onClick={() => !remove.isPending && remove.mutate()}
          className={cn(
            "shrink-0 rounded p-1 text-muted-foreground hover:bg-accent group-hover:opacity-100",
            busy ? "opacity-100" : "opacity-0",
          )}
        >
          <StatusIcon status={status} idle={<IconX size={12} />} size={12} />
          <StatusAnnouncer message={status === "error" ? errorLabel : null} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{status === "error" ? errorLabel : label}</TooltipContent>
    </Tooltip>
  );
}
