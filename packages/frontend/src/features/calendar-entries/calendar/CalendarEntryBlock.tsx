import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { StatusAnnouncer, statusOf } from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { overrideCalendarEntryOccurrence } from "#/lib/api/calendarEntries.ts";
import type { CalendarEntry, CalendarEntryOverride } from "#/lib/api/types.ts";
import { formatClock, formatShortDate } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../../sessions/external-calendars/overlay-layout";
import {
  blockLinesFor,
  minutesToTime,
  timeToMinutes,
} from "../../sessions/calendar/calendar-model";
import {
  BlockCancelButton,
  BlockResizeHandles,
  useBlockDrag,
} from "../../sessions/calendar/item-block-controls";
import { CalendarEntryPopover } from "./CalendarEntryPopover";
import { qk } from "#/lib/query-keys.ts";

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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.calendarEntries.root });
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
  const { previewRange, handleFor, top, height } = useBlockDrag({
    startMin,
    endMin,
    days,
    dayIndex,
    position,
    onReschedule: reschedule.mutate,
  });
  const draggable = !entry.cancelled;
  const short = height < 36;
  const lines = blockLinesFor(height);
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
          <span className="flex min-w-0 shrink-0 items-center gap-1 font-semibold">
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
          {!short && lines >= 3 && entry.location && (
            <span className="shrink-0 truncate opacity-70">{entry.location}</span>
          )}
        </button>
      </CalendarEntryPopover>
      {draggable && (
        <BlockResizeHandles handleFor={handleFor} hoverClassName="hover:bg-(--entry-color)/50" />
      )}
      {!entry.cancelled && (
        <BlockCancelButton
          status={cancelStatus}
          label={cancelLabel}
          onCancel={() => !cancel.isPending && cancel.mutate()}
        />
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
  daySpan,
}: {
  spaceId: string;
  entry: CalendarEntry;
  highlighted: boolean;
  showTime?: boolean;
  accentColor?: string;
  /// See `CalendarEntryBlock`'s `secondary`.
  secondary?: boolean;
  /// Where this day falls in a multi-day entry's span (see
  /// `calendar-model`'s `daySpanFor`), so only its first day shows the start
  /// time and only its last day shows the end time.
  daySpan?: "start" | "middle" | "end" | null;
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
        {daySpan && daySpan !== "start" && <span className="shrink-0 opacity-60">←</span>}
        {(showTime || daySpan === "start") && !entry.allDay && (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatClock(entry.startTime ?? "00:00")}
          </span>
        )}
        <EntityIcon entity={entry.entity} size={13} className="shrink-0 text-(--entry-color)" />
        <span className="truncate">{displayTitle(entry.entity)}</span>
        {daySpan === "end" && !entry.allDay && (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatClock(entry.endTime ?? "00:00")}
          </span>
        )}
        {daySpan && daySpan !== "end" && <span className="shrink-0 opacity-60">→</span>}
      </button>
    </CalendarEntryPopover>
  );
}

function entryTooltip(entry: CalendarEntry): string {
  const title = `${entry.entity.key} ${displayTitle(entry.entity)}`;
  const span =
    entry.endDate && entry.endDate !== entry.date
      ? `, ${formatShortDate(entry.date)} to ${formatShortDate(entry.endDate)}`
      : "";
  return `${title}${span}${entry.location ? `, ${entry.location}` : ""}`;
}
