import type { Editor } from "@tiptap/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { perFrame } from "./pointer-frame";

export interface HandleRect {
  top: number;
  left: number;
  height: number;
}

export interface Indicator {
  top: number;
  left: number;
  width: number;
}

export interface DragPreviewState {
  html: string;
  x: number;
  y: number;
}

/// The line showing where a dragged block or row will land.
export function DropIndicator({ indicator }: { indicator: Indicator }) {
  return (
    <div
      className="pointer-events-none absolute top-(--indicator-top) left-(--indicator-left) z-10 h-0.5 w-(--indicator-width) rounded-full bg-primary"
      // SAFETY: pixel lengths measured from the drop target's DOM box.
      style={
        {
          "--indicator-top": `${indicator.top - 1}px`,
          "--indicator-left": `${indicator.left}px`,
          "--indicator-width": `${indicator.width}px`,
        } as CSSProperties
      }
    />
  );
}

/// The snapshot of the dragged markup that follows the cursor.
export function DragPreview({ preview }: { preview: DragPreviewState }) {
  return (
    <div
      // `px-2` (utilities layer) also overrides `.tiptap-content`'s handle-gutter
      // padding, which doesn't apply to this standalone snapshot.
      className="tiptap-content pointer-events-none fixed top-(--preview-y) left-(--preview-x) z-50 max-h-40 max-w-xs overflow-hidden rounded-md border border-border bg-popover px-2 py-1 opacity-70 shadow-lg"
      // SAFETY: pixel offsets from the cursor's client coordinates.
      style={
        {
          "--preview-x": `${preview.x + 14}px`,
          "--preview-y": `${preview.y + 14}px`,
        } as CSSProperties
      }
      // SAFETY: `html` is a clone of markup our own schema-controlled ProseMirror view rendered.
      dangerouslySetInnerHTML={{ __html: preview.html }}
    />
  );
}

/// Runs `measure` once now and then at most once per frame after each editor transaction.
export function useMeasureOnTransaction(editor: Editor | null, measure: () => void) {
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      measureRef.current();
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    update();
    editor.on("transaction", update);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", update);
    };
  }, [editor]);
}

/// The state every drag handle shares: where the handle sits and whether it shows, the
/// drop indicator, the cursor snapshot and whether a drag is running.
export function useDragHandleState() {
  const [handle, setHandle] = useState<HandleRect>({ top: -9999, left: -9999, height: 0 });
  const [visible, setVisible] = useState(false);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  // Snapshot of the dragged block or row (as markup, not a live node) shown next to the
  // cursor during a drag. `html` is a clone of markup our own schema-controlled
  // ProseMirror view already rendered, not external input.
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const draggingRef = useRef(false);
  return {
    handle,
    setHandle,
    visible,
    setVisible,
    indicator,
    setIndicator,
    dragPreview,
    setDragPreview,
    draggingRef,
  };
}

/// Listens to the document's mouse for a custom drag: `onMouseMove` runs at most once per
/// frame, `onMouseUp` on release. Returns the cleanup, for an effect to return.
export function trackDocumentMouse(
  onMouseMove: (event: MouseEvent) => void,
  onMouseUp: (event: MouseEvent) => void,
): () => void {
  const onMouseMoveFrame = perFrame(onMouseMove);
  document.addEventListener("mousemove", onMouseMoveFrame);
  document.addEventListener("mouseup", onMouseUp);
  return () => {
    onMouseMoveFrame.cancel();
    document.removeEventListener("mousemove", onMouseMoveFrame);
    document.removeEventListener("mouseup", onMouseUp);
  };
}
