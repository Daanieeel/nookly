import { IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CSSProperties } from "react";
import { StatusAnnouncer, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { overrideCalendarEntryOccurrence } from "#/lib/api/calendarEntries.ts";
import type { CalendarEntry, CalendarEntryOverride } from "#/lib/api/types.ts";
import { formatClock } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../../sessions/external-calendars/overlay-layout";
import {
  heightPxFor,
  minutesToTime,
  timeToMinutes,
  topPxFor,
} from "../../sessions/calendar/calendar-model";
import { useItemDrag } from "../../sessions/calendar/item-drag";
import { CalendarEntryPopover } from "./CalendarEntryPopover";

/// A calendar entry occurrence on the time grid: solid and the bolder of the
/// two (personal entries carry more visual weight than class occurrences),
/// tinted with `--accent-purple` rather than Sessions' `--primary`, and
/// carrying its own colored type icon — three signals (shape, hue, icon) so
/// it never reads as a Session at a glance, even on the unified page where
/// both get retinted to the same Space color.
export function CalendarEntryBlock({
  spaceId,
  entry,
  position,
  highlighted,
  accentColor,
  secondary,
  days,
  dayIndex,
}: {
  spaceId: string;
  entry: CalendarEntry;
  position: BlockPosition;
  highlighted: boolean;
  /// Overrides the default `--accent-purple` tint with the occurrence's own
  /// Space accent color — used only by the unified cross-Space Calendar page.
  accentColor?: string;
  /// True on the Sessions page, where a Calendar entry is secondary context
  /// next to that Space's own Sessions: rendered with less visual weight, but
  /// still fully editable via the same popover.
  secondary?: boolean;
  /// The visible days on the time grid, and this entry's own column among
  /// them, so dragging it to a new place can resolve which day it landed on
  /// (see `useItemDrag`).
  days: Date[];
  dayIndex: number;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "calendar-entries" });
  const cancel = useMutation({
    mutationFn: () => overrideCalendarEntryOccurrence(entry.entity.id, { cancelled: true }),
    onSuccess: invalidate,
  });
  const reschedule = useMutation({
    mutationFn: (patch: CalendarEntryOverride) =>
      overrideCalendarEntryOccurrence(entry.entity.id, patch),
    onSuccess: invalidate,
  });
  const cancelStatus = statusOf(cancel);
  const cancelLabel =
    cancelStatus === "error" ? "Couldn't cancel entry, try again" : "Cancel entry";

  const startMin = timeToMinutes(entry.startTime ?? "00:00");
  const endMin = timeToMinutes(entry.endTime ?? "00:00");
  const { previewRange, handleFor } = useItemDrag({
    startMin,
    endMin,
    dayIndex,
    dayCount: days.length,
    onCommit: (result) => {
      const patch: CalendarEntryOverride = {
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
  const draggable = !entry.cancelled;
  const short = height < 36;
  return (
    <div
      data-calendar-item
      className={cn(
        "group absolute top-(--occ-top) left-(--occ-left) z-10 h-(--occ-height) w-(--occ-width) overflow-hidden rounded-lg border transition-shadow",
        entry.cancelled
          ? "border-border bg-muted text-muted-foreground"
          : "border-(--entry-color)/60 bg-(--entry-color)/30 text-foreground shadow-xs",
        secondary && !entry.cancelled && "opacity-70 shadow-none",
        highlighted && "ring-2 ring-(--entry-color)",
        previewRange && "z-30 shadow-lg transition-none",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
      // SAFETY: the `--occ-*` vars only ever receive plain pixel or `calc()`
      // lengths computed from this occurrence's own start/end time and column,
      // `--occ-shift` only ever receives the live drag's own column-width based
      // pixel offset, and `--entry-color` only ever receives `accentColor` (a
      // Space's own validated hex accent) or falls back to the
      // `--accent-purple` token — a per row/Space value can't be a static
      // Tailwind class.
      style={
        {
          "--occ-top": `${top}px`,
          "--occ-height": `${height}px`,
          "--occ-left": position.left,
          "--occ-width": position.width,
          "--entry-color": accentColor ?? "var(--accent-purple)",
          transform: previewRange?.dayDeltaPx
            ? `translateX(${previewRange.dayDeltaPx}px)`
            : undefined,
        } as CSSProperties
      }
      {...entityTarget(entry.entity, entry)}
      {...(draggable ? handleFor("move") : {})}
    >
      <CalendarEntryPopover spaceId={spaceId} entry={entry}>
        <button
          type="button"
          title={entryTooltip(entry)}
          className={cn(
            "flex size-full flex-col items-stretch justify-start overflow-hidden border-l-4 px-1.5 py-0.5 text-left text-xs",
            entry.cancelled
              ? "border-l-transparent line-through opacity-60"
              : "border-l-(--entry-color) hover:bg-(--entry-color)/20",
            short && "flex-row items-baseline gap-1.5",
          )}
        >
          <span className="flex min-w-0 items-center gap-1 font-semibold">
            <EntityIcon entity={entry.entity} size={14} className="shrink-0 text-(--entry-color)" />
            <span className="truncate">{displayTitle(entry.entity)}</span>
          </span>
          <span className="shrink-0 truncate opacity-70">
            {entry.allDay
              ? "All day"
              : `${formatClock(minutesToTime(previewRange?.startMin ?? startMin))}${
                  short ? "" : ` to ${formatClock(minutesToTime(previewRange?.endMin ?? endMin))}`
                }`}
          </span>
          {!short && entry.location && (
            <span className="truncate opacity-70">{entry.location}</span>
          )}
        </button>
      </CalendarEntryPopover>
      {draggable && (
        <>
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize opacity-0 hover:bg-(--entry-color)/50 group-hover:opacity-100"
            {...handleFor("resize-start")}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-row-resize opacity-0 hover:bg-(--entry-color)/50 group-hover:opacity-100"
            {...handleFor("resize-end")}
          />
        </>
      )}
      {!entry.cancelled && (
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
      <StatusAnnouncer message={cancelStatus === "error" ? "Couldn't cancel entry" : null} />
    </div>
  );
}

/// One calendar entry occurrence as a single line in a month cell, or the all-day strip.
export function CalendarEntryChip({
  spaceId,
  entry,
  highlighted,
  showTime = false,
  accentColor,
  secondary,
}: {
  spaceId: string;
  entry: CalendarEntry;
  highlighted: boolean;
  showTime?: boolean;
  accentColor?: string;
  /// See `CalendarEntryBlock`'s `secondary`.
  secondary?: boolean;
}) {
  return (
    <CalendarEntryPopover spaceId={spaceId} entry={entry}>
      <button
        type="button"
        data-calendar-item
        title={entryTooltip(entry)}
        className={cn(
          "flex h-5 w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm border-l-4 px-1 text-left text-xs",
          entry.cancelled
            ? "border-l-muted-foreground text-muted-foreground line-through hover:bg-accent"
            : "border-l-(--entry-color) bg-(--entry-color)/25 font-medium hover:bg-(--entry-color)/35",
          secondary && !entry.cancelled && "opacity-70",
          highlighted && "ring-2 ring-(--entry-color)",
        )}
        // SAFETY: see `CalendarEntryBlock` above — a hex color or the `--accent-purple` token.
        style={{ "--entry-color": accentColor ?? "var(--accent-purple)" } as CSSProperties}
        {...entityTarget(entry.entity, entry)}
      >
        {showTime && !entry.allDay && (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatClock(entry.startTime ?? "00:00")}
          </span>
        )}
        <EntityIcon entity={entry.entity} size={13} className="shrink-0 text-(--entry-color)" />
        <span className="truncate">{displayTitle(entry.entity)}</span>
      </button>
    </CalendarEntryPopover>
  );
}

function entryTooltip(entry: CalendarEntry): string {
  const title = `${entry.entity.key} ${displayTitle(entry.entity)}`;
  return entry.location ? `${title}, ${entry.location}` : title;
}
