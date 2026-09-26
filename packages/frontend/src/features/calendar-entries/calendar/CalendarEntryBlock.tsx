import { IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { StatusAnnouncer, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { overrideCalendarEntryOccurrence } from "#/lib/api/calendarEntries.ts";
import type { CalendarEntry } from "#/lib/api/types.ts";
import { formatClock } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../../sessions/external-calendars/overlay-layout";
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
}: {
  spaceId: string;
  entry: CalendarEntry;
  position: BlockPosition;
  highlighted: boolean;
  /// Overrides the default `--accent-purple` tint with the occurrence's own
  /// Space accent color — used only by the unified cross-Space Calendar page.
  accentColor?: string;
}) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => overrideCalendarEntryOccurrence(entry.entity.id, { cancelled: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "calendar-entries" }),
  });
  const cancelStatus = statusOf(cancel);
  const cancelLabel =
    cancelStatus === "error" ? "Couldn't cancel entry, try again" : "Cancel entry";
  const short = position.height < 36;
  return (
    <div
      data-calendar-item
      className={cn(
        "group absolute top-(--occ-top) left-(--occ-left) z-10 h-(--occ-height) w-(--occ-width) overflow-hidden rounded-lg border transition-shadow",
        entry.cancelled
          ? "border-border bg-muted text-muted-foreground"
          : "border-(--entry-color)/60 bg-(--entry-color)/30 text-foreground shadow-xs",
        highlighted && "ring-2 ring-(--entry-color)",
      )}
      // SAFETY: the `--occ-*` vars only ever receive plain pixel or `calc()`
      // lengths computed from this occurrence's own start/end time and column,
      // and `--entry-color` only ever receives `accentColor` (a Space's own
      // validated hex accent) or falls back to the `--accent-purple` token —
      // a per row/Space value can't be a static Tailwind class.
      style={
        {
          "--occ-top": `${position.top}px`,
          "--occ-height": `${position.height}px`,
          "--occ-left": position.left,
          "--occ-width": position.width,
          "--entry-color": accentColor ?? "var(--accent-purple)",
        } as CSSProperties
      }
      {...entityTarget(entry.entity, entry)}
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
              : `${formatClock(entry.startTime ?? "00:00")}${
                  short ? "" : ` to ${formatClock(entry.endTime ?? "00:00")}`
                }`}
          </span>
          {!short && entry.location && (
            <span className="truncate opacity-70">{entry.location}</span>
          )}
        </button>
      </CalendarEntryPopover>
      {!entry.cancelled && (
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
}: {
  spaceId: string;
  entry: CalendarEntry;
  highlighted: boolean;
  showTime?: boolean;
  accentColor?: string;
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
