import { IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { StatusAnnouncer, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { overrideOccurrence } from "#/lib/api/sessions.ts";
import type { SessionOccurrence } from "#/lib/api/types.ts";
import { formatClock } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../external-calendars/overlay-layout";
import { SessionPopover } from "./SessionPopover";

/// A Session occurrence on the time grid: outlined and quieter than a
/// calendar entry (personal entries carry more visual weight than class
/// occurrences), tinted with the primary color by default, and carrying its
/// own type icon so it reads apart from a calendar entry even when both
/// share the unified page's per-Space tint. The unified page overrides the
/// tint to the occurrence's own Space accent color instead, via
/// `accentColor`, since there's no single "active" Space color to fall back
/// on there.
export function SessionBlock({
  spaceId,
  occurrence,
  position,
  highlighted,
  accentColor,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  position: BlockPosition;
  /// Briefly true right after the occurrence was created.
  highlighted: boolean;
  accentColor?: string;
}) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => overrideOccurrence(occurrence.entity.id, { cancelled: true }),
    // A predicate (not a fixed queryKey) so this also invalidates the
    // cross-Space ["sessions", "all"] cache the unified Calendar page reads.
    onSuccess: () =>
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "sessions" }),
  });
  const cancelStatus = statusOf(cancel);
  const cancelLabel =
    cancelStatus === "error" ? "Couldn't cancel occurrence, try again" : "Cancel occurrence";
  const short = position.height < 36;
  return (
    <div
      data-calendar-item
      className={cn(
        "group absolute top-(--occ-top) left-(--occ-left) z-10 h-(--occ-height) w-(--occ-width) overflow-hidden rounded-md transition-shadow",
        occurrence.cancelled
          ? "border border-border bg-muted text-muted-foreground"
          : "border-2 border-(--session-color) bg-(--session-color)/6 text-foreground",
        highlighted && "ring-2 ring-(--session-color)",
      )}
      // SAFETY: the `--occ-*` vars only ever receive plain pixel or `calc()`
      // lengths computed from this occurrence's own start/end time and column,
      // and `--session-color` only ever receives `accentColor` (a Space's own
      // validated hex accent) or falls back to the `--primary` token — a per
      // row/Space value can't be a static Tailwind class.
      style={
        {
          "--occ-top": `${position.top}px`,
          "--occ-height": `${position.height}px`,
          "--occ-left": position.left,
          "--occ-width": position.width,
          "--session-color": accentColor ?? "var(--primary)",
        } as CSSProperties
      }
      {...entityTarget(occurrence.entity, occurrence)}
    >
      <SessionPopover spaceId={spaceId} occurrence={occurrence}>
        <button
          type="button"
          title={sessionTooltip(occurrence)}
          className={cn(
            "flex size-full flex-col items-stretch justify-start overflow-hidden px-1.5 py-0.5 text-left text-xs",
            occurrence.cancelled ? "line-through opacity-60" : "hover:bg-(--session-color)/14",
            short && "flex-row items-baseline gap-1.5",
          )}
        >
          <span className="flex min-w-0 items-center gap-1 font-medium">
            <EntityIcon
              entity={occurrence.entity}
              size={11}
              className="shrink-0 text-(--session-color)"
            />
            <span className="truncate">{displayTitle(occurrence.entity)}</span>
          </span>
          {occurrence.courseTitle && (
            <span className="min-w-0 truncate">{occurrence.courseTitle}</span>
          )}
          <span className="shrink-0 truncate">
            {formatClock(occurrence.startTime)}
            {short ? "" : ` to ${formatClock(occurrence.endTime)}`}
          </span>
          {!short && occurrence.location && <span className="truncate">{occurrence.location}</span>}
        </button>
      </SessionPopover>
      {!occurrence.cancelled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={cancelLabel}
              onClick={() => !cancel.isPending && cancel.mutate()}
              className={cn(
                "absolute top-0.5 right-0.5 rounded-sm p-0.5 hover:bg-accent group-hover:opacity-100",
                cancelStatus === "idle" ? "opacity-0" : "opacity-100",
              )}
            >
              <StatusIcon status={cancelStatus} idle={<IconX size={11} />} size={11} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{cancelLabel}</TooltipContent>
        </Tooltip>
      )}
      <StatusAnnouncer message={cancelStatus === "error" ? "Couldn't cancel occurrence" : null} />
    </div>
  );
}

/// One Session occurrence as a single line in a month cell.
export function SessionChip({
  spaceId,
  occurrence,
  highlighted,
  accentColor,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  highlighted: boolean;
  accentColor?: string;
}) {
  return (
    <SessionPopover spaceId={spaceId} occurrence={occurrence}>
      <button
        type="button"
        data-calendar-item
        title={sessionTooltip(occurrence)}
        className={cn(
          "flex h-5 w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm px-1 text-left text-xs",
          occurrence.cancelled
            ? "border border-transparent text-muted-foreground line-through hover:bg-accent"
            : "border-2 border-(--session-color) bg-(--session-color)/6 text-foreground hover:bg-(--session-color)/14",
          highlighted && "ring-2 ring-(--session-color)",
        )}
        // SAFETY: see `SessionBlock` above — a hex color or the `--primary` token.
        style={{ "--session-color": accentColor ?? "var(--primary)" } as CSSProperties}
        {...entityTarget(occurrence.entity, occurrence)}
      >
        <span className="shrink-0 tabular-nums">{formatClock(occurrence.startTime)}</span>
        <EntityIcon entity={occurrence.entity} size={11} className="shrink-0 text-(--session-color)" />
        <span className="truncate">{displayTitle(occurrence.entity)}</span>
        {occurrence.courseTitle && (
          <span className="min-w-0 truncate text-muted-foreground">{occurrence.courseTitle}</span>
        )}
      </button>
    </SessionPopover>
  );
}

function sessionTooltip(occurrence: SessionOccurrence): string {
  const title = `${occurrence.entity.key} ${displayTitle(occurrence.entity)}`;
  return occurrence.courseTitle ? `${title}, ${occurrence.courseTitle}` : title;
}
