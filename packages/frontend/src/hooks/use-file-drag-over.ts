import { type DragEvent, useRef, useState } from "react";

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

/// Whether a file from outside the app is being dragged over an area, to show where it will
/// land. Spread `dragProps` on the area. It never cancels the events, so the drop still goes
/// to `useWindowFileDrop`.
export function useFileDragOver() {
  const [over, setOver] = useState(false);
  // Moving over a child fires enter on it before leave on the area, so count the pairs.
  const depth = useRef(0);
  const reset = () => {
    depth.current = 0;
    setOver(false);
  };
  return {
    over,
    dragProps: {
      onDragEnter: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current += 1;
        setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: reset,
    },
  };
}
