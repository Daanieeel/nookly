import { useMutation } from "@tanstack/react-query";
import {
  StatusAnnouncer,
  StatusIcon,
  statusTextClass,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { copyText } from "#/lib/clipboard.ts";
import { cn } from "@nookly/ui/lib/utils";

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

/// The key in a list row, copied on click. The key itself swaps to a green
/// "Copied" for two seconds as the in place confirmation.
export function EntityKeyCopyInline({
  entityKey,
  className,
}: {
  entityKey: string;
  className?: string;
}) {
  const copy = useMutation({ mutationFn: () => copyText(entityKey) });
  const status = useActionStatus(copy);
  const label = status === "error" ? "Couldn't copy, try again" : "Copy ID";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} ${entityKey}`}
          onClick={() => !copy.isPending && copy.mutate()}
          className={cn(
            "flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-sm px-1 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground",
            statusTextClass(status),
            className,
          )}
        >
          {status === "success" || status === "error" ? (
            <>
              <StatusIcon status={status} idle={null} size={12} />
              <span className="font-sans">{status === "success" ? "Copied" : "Failed"}</span>
            </>
          ) : (
            entityKey
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
      <StatusAnnouncer message={status === "success" ? `Copied ${entityKey}` : null} />
    </Tooltip>
  );
}

/// A card's key: copyable on a live card, plain text on a drag preview. Only the
/// key itself takes clicks, so the rest of the card still opens it.
export function CardKey({ entityKey, interactive }: { entityKey: string; interactive: boolean }) {
  if (!interactive) {
    return <EntityKey entityKey={entityKey} className="pointer-events-none relative" />;
  }
  return (
    <span className="pointer-events-none relative flex">
      <EntityKeyCopyInline
        entityKey={entityKey}
        className="pointer-events-auto -my-0.5 -ml-1 h-5"
      />
    </span>
  );
}
