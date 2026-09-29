import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DAY_MINUTES, HOUR_PX, SNAP_MINUTES } from "./calendar-model";

/// Below this many pixels of pointer travel, a pointerdown/up on a block still
/// counts as a click that opens its popover rather than a drag.
const CLICK_THRESHOLD_PX = 4;

export type ItemDragMode = "move" | "resize-start" | "resize-end";

export interface ItemDragRange {
  startMin: number;
  endMin: number;
  /// Day columns moved across; always 0 for a resize.
  dayDelta: number;
  /// `dayDelta` in pixels (the day column's own measured width), for a live
  /// transform while dragging; always 0 for a resize.
  dayDeltaPx: number;
}

interface DragState {
  mode: ItemDragMode;
  pointerId: number;
  anchorX: number;
  anchorY: number;
  /// The day column's own width in pixels, measured once at drag start (every
  /// column is the same width), used to turn horizontal travel into whole days.
  columnWidth: number;
  offsetMin: number;
  dayDelta: number;
}

export interface ItemDragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface UseItemDragResult {
  /// Set while a drag is in progress, for the live preview; null otherwise.
  previewRange: ItemDragRange | null;
  handleFor: (mode: ItemDragMode) => ItemDragHandleProps;
}

/// React bubbles events from portaled children (a block's popover) up the React
/// tree, so a press on the popover's own buttons would otherwise start a drag
/// of the block. Only events whose target sits inside the block's own DOM count.
function isOwnEvent(e: ReactPointerEvent<HTMLElement>): boolean {
  // SAFETY: a pointer event's target is a DOM element, which is always a `Node`.
  return e.currentTarget.contains(e.target as Node);
}

function snap(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

function resolve(state: DragState, startMin: number, endMin: number): ItemDragRange {
  const duration = endMin - startMin;
  if (state.mode === "move") {
    const start = Math.max(0, Math.min(startMin + state.offsetMin, DAY_MINUTES - duration));
    return {
      startMin: start,
      endMin: start + duration,
      dayDelta: state.dayDelta,
      dayDeltaPx: state.dayDelta * state.columnWidth,
    };
  }
  if (state.mode === "resize-start") {
    const start = Math.max(0, Math.min(startMin + state.offsetMin, endMin - SNAP_MINUTES));
    return { startMin: start, endMin, dayDelta: 0, dayDeltaPx: 0 };
  }
  const end = Math.min(DAY_MINUTES, Math.max(endMin + state.offsetMin, startMin + SNAP_MINUTES));
  return { startMin, endMin: end, dayDelta: 0, dayDeltaPx: 0 };
}

/// Powers the resize handles and whole-block drag-to-move on a Session or
/// Calendar entry block in the time grid: a plain click still opens the
/// block's popover (the drag only takes over past a small movement
/// threshold), and everything snaps to the same 15 minute grid as
/// drag-to-create. Reports the result in the block's own start/end minutes
/// plus a day-column delta (0 unless dragged to a different day); the caller
/// resolves that back to a real date and location and calls its own override
/// mutation — this hook only tracks the pointer.
export function useItemDrag({
  startMin,
  endMin,
  dayIndex,
  dayCount,
  onCommit,
}: {
  startMin: number;
  endMin: number;
  /// This item's column position among the visible days, so a move can be
  /// clamped to the days actually on screen.
  dayIndex: number;
  dayCount: number;
  onCommit: (result: ItemDragRange) => void;
}): UseItemDragResult {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Tracked outside React state so the click-swallow listener (below) always
  // reads the up to date value, even if it runs before this component's next
  // render commits.
  const movedRef = useRef(false);
  // Whether pointer capture has been grabbed yet for the drag in progress —
  // see `onPointerMove`.
  const capturedRef = useRef(false);

  useEffect(() => {
    if (!drag) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drag]);

  const handleFor = useCallback(
    (mode: ItemDragMode) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.button !== 0 || !isOwnEvent(e)) return;
        e.stopPropagation();
        movedRef.current = false;
        capturedRef.current = false;
        const column = e.currentTarget.closest<HTMLElement>("[data-day-column]");
        const columnWidth = column?.getBoundingClientRect().width ?? 0;
        // Pointer capture is grabbed lazily in `onPointerMove`, only once
        // real movement confirms this is a drag rather than a plain click.
        // Grabbing it here unconditionally used to break the click this same
        // trigger also handles (opening the block's popover): the WebKit
        // engine Tauri embeds stops delivering `click` to the actual pressed
        // element once an ancestor (this one) holds pointer capture, even
        // when the pointer never moved.
        setDrag({
          mode,
          pointerId: e.pointerId,
          anchorX: e.clientX,
          anchorY: e.clientY,
          columnWidth,
          offsetMin: 0,
          dayDelta: 0,
        });
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        if (!isOwnEvent(e)) return;
        setDrag((current) => {
          if (!current || current.pointerId !== e.pointerId) return current;
          const deltaX = e.clientX - current.anchorX;
          const deltaY = e.clientY - current.anchorY;
          if (
            !movedRef.current &&
            (Math.abs(deltaX) > CLICK_THRESHOLD_PX || Math.abs(deltaY) > CLICK_THRESHOLD_PX)
          ) {
            movedRef.current = true;
          }
          if (movedRef.current && !capturedRef.current) {
            capturedRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            if (current.mode === "move") {
              // Swallows the click the browser fires right after pointerup on
              // this same trigger, now that real movement happened, so a
              // plain click (no capture ever grabbed) still opens the
              // popover as normal.
              const onClick = (clickEvent: MouseEvent) => {
                if (movedRef.current) {
                  clickEvent.preventDefault();
                  clickEvent.stopPropagation();
                }
              };
              window.addEventListener("click", onClick, { capture: true, once: true });
            }
          }
          const offsetMin = snap((deltaY / HOUR_PX) * 60);
          const dayDelta =
            current.mode === "move" && current.columnWidth > 0
              ? Math.max(
                  -dayIndex,
                  Math.min(dayCount - 1 - dayIndex, Math.round(deltaX / current.columnWidth)),
                )
              : 0;
          if (offsetMin === current.offsetMin && dayDelta === current.dayDelta) return current;
          return { ...current, offsetMin, dayDelta };
        });
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        if (!isOwnEvent(e)) return;
        setDrag((current) => {
          if (!current || current.pointerId !== e.pointerId) return null;
          if (movedRef.current) onCommit(resolve(current, startMin, endMin));
          return null;
        });
      },
      onPointerCancel: () => setDrag(null),
    }),
    [dayIndex, dayCount, onCommit, startMin, endMin],
  );

  return {
    previewRange: drag ? resolve(drag, startMin, endMin) : null,
    handleFor,
  };
}
