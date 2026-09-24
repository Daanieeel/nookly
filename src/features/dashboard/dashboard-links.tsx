import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listSpaces } from "@/lib/api/spaces";
import { type ModuleKey, useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";

/// Where a Dashboard reference leads. A count opens its module's list page, a name
/// opens that exact entity.
export type LinkTarget =
  | { kind: "list"; module: ModuleKey; spaceIds: string[] }
  | { kind: "entity"; entityId: string; spaceId: string };

export function listLink(module: ModuleKey, spaceIds: string[] = []): LinkTarget {
  return { kind: "list", module, spaceIds: [...new Set(spaceIds)] };
}

export function entityLink(entityId: string, spaceId: string): LinkTarget {
  return { kind: "entity", entityId, spaceId };
}

/// List pages live inside one Space, while Dashboard counts span all of them. A
/// count whose items all sit in one Space opens that Space's list; otherwise the
/// active Space's (when it holds any of them, or there's nothing to count), then
/// the first Space involved.
export function useOpenTarget(): (target: LinkTarget) => void {
  const setView = useNavStore((s) => s.setView);
  const openEntity = useNavStore((s) => s.openEntity);
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  return useCallback(
    (target: LinkTarget) => {
      if (target.kind === "entity") {
        openEntity(target.entityId, target.spaceId);
        return;
      }
      const { spaceIds } = target;
      const spaceId =
        spaceIds.length === 1
          ? spaceIds[0]
          : activeSpaceId && (spaceIds.length === 0 || spaceIds.includes(activeSpaceId))
            ? activeSpaceId
            : (spaceIds[0] ?? spaces[0]?.id);
      if (spaceId) setView({ kind: "module", spaceId, module: target.module });
    },
    [activeSpaceId, openEntity, setView, spaces],
  );
}

/// Every entity name on the Dashboard renders as this bounded pill, whatever its
/// length, so a long title never breaks the line it sits in. The full title is
/// always in the tooltip. Without `onClick` it's a plain label, for rows that are
/// themselves the link.
export function EntityPill({
  title,
  onClick,
  className,
}: {
  title: string;
  onClick?: () => void;
  className?: string;
}) {
  const classes = cn(
    "inline-flex max-w-[200px] rounded-md bg-accent px-1.5 align-baseline font-semibold text-foreground",
    onClick &&
      "cursor-pointer transition-colors hover:bg-accent/60 hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    className,
  );
  const label = <span className="truncate">{title}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onClick ? (
          <button type="button" onClick={onClick} className={classes}>
            {label}
          </button>
        ) : (
          <span className={classes}>{label}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

/// Short clickable tokens (counts, times, days): bold text that shows it's a link
/// on hover rather than a pill, since they can't run long.
export function LinkToken({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-sm font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}
