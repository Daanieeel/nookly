import { useState, type DragEvent } from "react";

/// Drop target wiring for reorderable items: spread `dropProps` on the element and use
/// `dragOver` to highlight it while something is dragged over. `onDrop` runs on release.
export function useDropTarget(onDrop: () => void) {
  const [dragOver, setDragOver] = useState(false);
  return {
    dragOver,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      },
      onDragLeave: () => setDragOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        onDrop();
      },
    },
  };
}
