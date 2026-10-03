import { IconX } from "@tabler/icons-react";
import { format } from "date-fns";
import type { OccurrenceOverride } from "#/lib/api/types.ts";
import { type ActionStatus, StatusIcon } from "#/components/action-feedback.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../external-calendars/overlay-layout";
import { heightPxFor, minutesToTime, topPxFor } from "./calendar-model";
import {
  type ItemDragHandleProps,
  type ItemDragMode,
  type ItemDragRange,
  useItemDrag,
} from "./item-drag";

/// What a finished drag changes on an occurrence: its times, and its day when it landed
/// in another column.
export function reschedulePatch(
  result: ItemDragRange,
  days: Date[],
  dayIndex: number,
): OccurrenceOverride {
  const patch: OccurrenceOverride = {
    startTime: minutesToTime(result.startMin),
    endTime: minutesToTime(result.endMin),
  };
  const targetDay = result.dayDelta !== 0 ? days[dayIndex + result.dayDelta] : undefined;
  if (targetDay) patch.date = format(targetDay, "yyyy-MM-dd");
  return patch;
}

/// The strips on a block's top and bottom edge that resize it by dragging. The caller
/// passes the hover tint class so it stays a literal Tailwind class in its own source.
export function BlockResizeHandles({
  handleFor,
  hoverClassName,
}: {
  handleFor: (mode: ItemDragMode) => ItemDragHandleProps;
  hoverClassName: string;
}) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize opacity-0 group-hover:opacity-100",
          hoverClassName,
        )}
        {...handleFor("resize-start")}
      />
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-row-resize opacity-0 group-hover:opacity-100",
          hoverClassName,
        )}
        {...handleFor("resize-end")}
      />
    </>
  );
}

/// The corner X that cancels one occurrence, showing the cancel mutation's status.
export function BlockCancelButton({
  status,
  label,
  onCancel,
}: {
  status: ActionStatus;
  label: string;
  onCancel: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onCancel}
          className={cn(
            "absolute top-0.5 right-0.5 z-20 rounded-sm p-0.5 hover:bg-accent group-hover:opacity-100",
            status === "idle" ? "opacity-0" : "opacity-100",
          )}
        >
          <StatusIcon status={status} idle={<IconX size={11} />} size={11} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/// Drag and resize of an occurrence block: while dragging, `top` and `height` follow the
/// preview, and a finished drag calls `onReschedule` with the patch it implies.
export function useBlockDrag({
  startMin,
  endMin,
  days,
  dayIndex,
  position,
  onReschedule,
}: {
  startMin: number;
  endMin: number;
  days: Date[];
  dayIndex: number;
  position: BlockPosition;
  onReschedule: (patch: OccurrenceOverride) => void;
}) {
  const { previewRange, handleFor } = useItemDrag({
    startMin,
    endMin,
    dayIndex,
    dayCount: days.length,
    onCommit: (result) => onReschedule(reschedulePatch(result, days, dayIndex)),
  });
  const top = previewRange ? topPxFor(previewRange.startMin) : position.top;
  const height = previewRange
    ? heightPxFor(previewRange.startMin, previewRange.endMin)
    : position.height;
  return { previewRange, handleFor, top, height };
}
