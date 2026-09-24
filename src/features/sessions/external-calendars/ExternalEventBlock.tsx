import { IconBrandApple, IconBrandGoogle, IconClock, IconMapPin } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarProvider, ExternalEvent } from "@/lib/api/externalCalendars";
import { formatDate, formatShortDate, formatTime } from "@/lib/datetime";
import { type BlockPosition, safeColor } from "./overlay-layout";

export const PROVIDER_LABELS = {
  google: "Google Calendar",
  icloud: "iCloud",
} satisfies Record<CalendarProvider, string>;

export function ProviderIcon({
  provider,
  size = 12,
}: {
  provider: CalendarProvider;
  size?: number;
}) {
  return provider === "google" ? (
    <IconBrandGoogle size={size} className="shrink-0" />
  ) : (
    <IconBrandApple size={size} className="shrink-0" />
  );
}

/// A timed external event on the week grid. Dashed and muted next to the solid
/// Session blocks, so it never reads as part of course tracking. It is not an
/// entity: clicking only shows read only details.
export function ExternalEventBlock({
  event,
  position,
}: {
  event: ExternalEvent;
  position: BlockPosition;
}) {
  const color = safeColor(event.color);
  return (
    <ExternalEventPopover event={event}>
      <button
        type="button"
        aria-label={`${event.title || "Busy"}, from ${PROVIDER_LABELS[event.provider]}`}
        className="absolute top-(--occ-top) left-(--occ-left) h-(--occ-height) w-(--occ-width) overflow-hidden rounded-md border border-dashed border-(--ext-color) bg-(--ext-color)/10 px-1.5 py-1 text-left text-xs text-muted-foreground opacity-80 transition-opacity hover:opacity-100 data-[state=open]:opacity-100"
        // SAFETY: the `--occ-*` vars are plain pixel or `calc()` lengths computed
        // from the event's own times and column, and `--ext-color` is a hex color
        // checked by `safeColor` (or a token var); per event values can't be
        // static classes.
        style={
          {
            "--occ-top": `${position.top}px`,
            "--occ-height": `${position.height}px`,
            "--occ-left": position.left,
            "--occ-width": position.width,
            "--ext-color": color,
          } as CSSProperties
        }
      >
        <span className="flex items-center gap-1 truncate font-medium">
          <span className="truncate">{event.title || "Busy"}</span>
        </span>
        {!event.allDay && (
          <span className="block truncate opacity-80">
            {formatTime(event.start)} to {formatTime(event.end)}
          </span>
        )}
      </button>
    </ExternalEventPopover>
  );
}

/// An all day external event in the strip under the day headers.
export function ExternalEventChip({ event }: { event: ExternalEvent }) {
  const color = safeColor(event.color);
  return (
    <ExternalEventPopover event={event}>
      <button
        type="button"
        aria-label={`${event.title || "Busy"}, all day, from ${PROVIDER_LABELS[event.provider]}`}
        className="flex h-5 w-full min-w-0 items-center gap-1 rounded-sm border border-dashed border-(--ext-color) bg-(--ext-color)/10 px-1 text-left text-xs text-muted-foreground opacity-80 transition-opacity hover:opacity-100 data-[state=open]:opacity-100"
        // SAFETY: `--ext-color` is a hex color checked by `safeColor`, or a token var.
        style={{ "--ext-color": color } as CSSProperties}
      >
        <span className="truncate">{event.title || "Busy"}</span>
      </button>
    </ExternalEventPopover>
  );
}

function ExternalEventPopover({ event, children }: { event: ExternalEvent; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-2 p-3 text-sm">
        <span className="font-medium wrap-break-word">{event.title || "Busy"}</span>
        <span className="flex items-start gap-2 text-muted-foreground">
          <IconClock size={14} className="mt-0.5 shrink-0" />
          <span>{describeTime(event)}</span>
        </span>
        {event.location && (
          <span className="flex items-start gap-2 text-muted-foreground">
            <IconMapPin size={14} className="mt-0.5 shrink-0" />
            <span className="wrap-break-word">{event.location}</span>
          </span>
        )}
        <span className="flex items-center gap-2 text-muted-foreground">
          <span
            className="ml-1 size-2 shrink-0 rounded-full bg-(--ext-color)"
            // SAFETY: `--ext-color` is a hex color checked by `safeColor`, or a token var.
            style={{ "--ext-color": safeColor(event.color) } as CSSProperties}
          />
          <span className="truncate">{event.calendarName}</span>
        </span>
        <span className="flex items-center gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
          <ProviderIcon provider={event.provider} />
          From {PROVIDER_LABELS[event.provider]}
        </span>
      </PopoverContent>
    </Popover>
  );
}

function describeTime(event: ExternalEvent): string {
  if (event.allDay) {
    const last = lastDay(event.end);
    return last === event.start
      ? `${formatDate(event.start)}, all day`
      : `${formatShortDate(event.start)} to ${formatShortDate(last)}, all day`;
  }
  const sameDay = formatDate(event.start) === formatDate(event.end);
  return sameDay
    ? `${formatDate(event.start)}, ${formatTime(event.start)} to ${formatTime(event.end)}`
    : `${formatShortDate(event.start)} ${formatTime(event.start)} to ${formatShortDate(event.end)} ${formatTime(event.end)}`;
}

/// The last day an all day event covers; its `end` is exclusive.
function lastDay(end: string): string {
  const [y, m, d] = end.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}
