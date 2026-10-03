import { IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CSSProperties } from "react";
import { StatusAnnouncer, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { overrideOccurrence } from "#/lib/api/sessions.ts";
import type { OccurrenceOverride, SessionOccurrence } from "#/lib/api/types.ts";
import { formatClock } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../external-calendars/overlay-layout";
import { heightPxFor, minutesToTime, timeToMinutes, topPxFor } from "./calendar-model";
import { useItemDrag } from "./item-drag";
import { SessionPopover } from "./SessionPopover";
import { useNavStore } from "#/lib/store/nav.ts";
import { qk } from "#/lib/query-keys.ts";

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
  secondary,
  days,
  dayIndex,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  position: BlockPosition;
  /// Briefly true right after the occurrence was created.
  highlighted: boolean;
  accentColor?: string;
  /// True on the Calendar module page, where a Session is secondary context
  /// next to that Space's own Calendar entries: rendered with less visual
  /// weight, but still fully editable via the same popover.
  secondary?: boolean;
  /// The visible days on the time grid, and this occurrence's own column
  /// among them, so dragging it to a new place can resolve which day it
  /// landed on (see `useItemDrag`).
  days: Date[];
  dayIndex: number;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const invalidate = () =>
    // The root key (not a per Space key) so this also invalidates the
    // cross-Space qk.sessions.all cache the unified Calendar page reads.
    queryClient.invalidateQueries({ queryKey: qk.sessions.root });
  const cancel = useMutation({
    mutationFn: () => overrideOccurrence(occurrence.entity.id, { cancelled: true }),
    onSuccess: invalidate,
  });
  const reschedule = useMutation({
    mutationFn: (patch: OccurrenceOverride) => overrideOccurrence(occurrence.entity.id, patch),
    onSuccess: invalidate,
  });
  const cancelStatus = statusOf(cancel);
  const cancelLabel =
    cancelStatus === "error" ? "Couldn't cancel occurrence, try again" : "Cancel occurrence";

  const startMin = timeToMinutes(occurrence.startTime);
  const endMin = timeToMinutes(occurrence.endTime);
  const { previewRange, handleFor } = useItemDrag({
    startMin,
    endMin,
    dayIndex,
    dayCount: days.length,
    onCommit: (result) => {
      const patch: OccurrenceOverride = {
        startTime: minutesToTime(result.startMin),
        endTime: minutesToTime(result.endMin),
      };
      const targetDay = result.dayDelta !== 0 ? days[dayIndex + result.dayDelta] : undefined;
      if (targetDay) patch.date = format(targetDay, "yyyy-MM-dd");
      reschedule.mutate(patch);
    },
  });
  const top = previewRange ? topPxFor(previewRange.startMin) : position.top;
  const height = previewRange
    ? heightPxFor(previewRange.startMin, previewRange.endMin)
    : position.height;
  const draggable = !occurrence.cancelled;
  const short = height < 36;
  return (
    <div
      data-calendar-item
      className={cn(
        "group absolute top-(--occ-top) left-(--occ-left) z-10 h-(--occ-height) w-(--occ-width) overflow-hidden rounded-md transition-shadow",
        occurrence.cancelled
          ? "border border-border bg-muted text-muted-foreground"
          : "border-2 border-(--session-color) bg-(--session-color)/6 text-foreground",
        secondary && !occurrence.cancelled && "opacity-70",
        highlighted && "ring-2 ring-(--session-color)",
        previewRange && "z-30 shadow-lg transition-none",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
      // SAFETY: the `--occ-*` vars only ever receive plain pixel or `calc()`
      // lengths computed from this occurrence's own start/end time and column,
      // `--occ-shift` only ever receives the live drag's own column-width based
      // pixel offset, and `--session-color` only ever receives `accentColor` (a
      // Space's own validated hex accent) or falls back to the `--primary`
      // token — a per row/Space value can't be a static Tailwind class.
      style={
        {
          "--occ-top": `${top}px`,
          "--occ-height": `${height}px`,
          "--occ-left": position.left,
          "--occ-width": position.width,
          "--session-color": accentColor ?? "var(--primary)",
          transform: previewRange?.dayDeltaPx
            ? `translateX(${previewRange.dayDeltaPx}px)`
            : undefined,
        } as CSSProperties
      }
      onDoubleClick={() => openEntity(occurrence.entity.id, spaceId)}
      {...entityTarget(occurrence.entity, occurrence)}
      {...(draggable ? handleFor("move") : {})}
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
            {formatClock(minutesToTime(previewRange?.startMin ?? startMin))}
            {short ? "" : ` to ${formatClock(minutesToTime(previewRange?.endMin ?? endMin))}`}
          </span>
          {!short && occurrence.location && <span className="truncate">{occurrence.location}</span>}
        </button>
      </SessionPopover>
      {draggable && (
        <>
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize opacity-0 hover:bg-(--session-color)/50 group-hover:opacity-100"
            {...handleFor("resize-start")}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-row-resize opacity-0 hover:bg-(--session-color)/50 group-hover:opacity-100"
            {...handleFor("resize-end")}
          />
        </>
      )}
      {!occurrence.cancelled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={cancelLabel}
              onClick={() => !cancel.isPending && cancel.mutate()}
              className={cn(
                "absolute top-0.5 right-0.5 z-20 rounded-sm p-0.5 hover:bg-accent group-hover:opacity-100",
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
  secondary,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  highlighted: boolean;
  accentColor?: string;
  /// See `SessionBlock`'s `secondary`.
  secondary?: boolean;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  return (
    <SessionPopover spaceId={spaceId} occurrence={occurrence}>
      <button
        type="button"
        data-calendar-item
        onDoubleClick={() => openEntity(occurrence.entity.id, spaceId)}
        title={sessionTooltip(occurrence)}
        className={cn(
          "flex h-5 w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm px-1 text-left text-xs",
          occurrence.cancelled
            ? "border border-transparent text-muted-foreground line-through hover:bg-accent"
            : "border-2 border-(--session-color) bg-(--session-color)/6 text-foreground hover:bg-(--session-color)/14",
          secondary && !occurrence.cancelled && "opacity-70",
          highlighted && "ring-2 ring-(--session-color)",
        )}
        // SAFETY: see `SessionBlock` above — a hex color or the `--primary` token.
        style={{ "--session-color": accentColor ?? "var(--primary)" } as CSSProperties}
        {...entityTarget(occurrence.entity, occurrence)}
      >
        <span className="shrink-0 tabular-nums">{formatClock(occurrence.startTime)}</span>
        <EntityIcon
          entity={occurrence.entity}
          size={11}
          className="shrink-0 text-(--session-color)"
        />
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
