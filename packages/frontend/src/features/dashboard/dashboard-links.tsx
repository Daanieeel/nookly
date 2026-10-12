import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { UNREFINED_JOT_FILTERS } from "#/features/notes/JotsListView.tsx";
import { requestFilters } from "#/features/views/pending-filters.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { listTaskStatuses } from "#/lib/api/tasks.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { type OverviewLink, overviewFilters } from "./dashboard-model";
import { type ModuleKey, useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { qk } from "#/lib/query-keys.ts";

/// Where a Dashboard reference leads. A count opens its module's list page, a name
/// opens that exact entity.
export type LinkTarget =
  | { kind: "list"; module: ModuleKey; spaceIds: string[] }
  /// The cross Space Tasks or Assignments page, opened on open items in these due buckets.
  | ({ kind: "overview" } & OverviewLink)
  | { kind: "entity"; entityId: string; spaceId: string };

export function listLink(module: ModuleKey, spaceIds: string[] = []): LinkTarget {
  return { kind: "list", module, spaceIds: [...new Set(spaceIds)] };
}

export function overviewLink(view: OverviewLink["view"], due: string[] = []): LinkTarget {
  return { kind: "overview", view, due };
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
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const { data: statuses = [] } = useQuery({
    queryKey: qk.tasks.statuses,
    queryFn: listTaskStatuses,
  });

  return useCallback(
    (target: LinkTarget) => {
      if (target.kind === "entity") {
        openEntity(target.entityId, target.spaceId);
        return;
      }
      if (target.kind === "overview") {
        requestFilters(
          target.view === "tasks"
            ? STORAGE_KEYS.tasksOverviewFilters
            : STORAGE_KEYS.assignmentsOverviewFilters,
          overviewFilters(target, statuses),
        );
        setView({ kind: target.view });
        return;
      }
      const { spaceIds } = target;
      const spaceId =
        spaceIds.length === 1
          ? spaceIds[0]
          : activeSpaceId && (spaceIds.length === 0 || spaceIds.includes(activeSpaceId))
            ? activeSpaceId
            : (spaceIds[0] ?? spaces[0]?.id);
      // Jots count what is still to refine, so the page opens on those, not on the
      // preset last picked.
      if (target.module === "jots") requestFilters(STORAGE_KEYS.jotsPreset, UNREFINED_JOT_FILTERS);
      if (spaceId) setView({ kind: "module", spaceId, module: target.module });
    },
    [activeSpaceId, openEntity, setView, spaces, statuses],
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
