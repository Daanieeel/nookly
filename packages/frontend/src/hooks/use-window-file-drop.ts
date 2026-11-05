import { useEffect, useRef } from "react";

/// Marks an area files can be dropped on. The value says what a drop there does; it is read by
/// whoever handles the drop (see `fileDropZone`).
export const FILE_DROP_ATTRIBUTE = "data-file-drop";

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/// Files dragged in from outside the app. The webview opens a dropped file in place of the
/// whole app unless the drop is cancelled, so this cancels every file drag and drop on the
/// window. A drop something inside the app already took (it cancelled the event) is left to
/// it. Any other drop goes to `onFiles` with the zone (an element marked `data-file-drop`)
/// it landed in, or `null`.
export function useWindowFileDrop(onFiles: (files: File[], zone: Element | null) => void) {
  const latest = useRef(onFiles);
  latest.current = onFiles;
  useEffect(() => {
    function onDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      // Without this the drop never fires and the webview opens the file instead.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    function onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      const taken = event.defaultPrevented;
      event.preventDefault();
      if (taken) return;
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      const target = event.target instanceof Element ? event.target : null;
      latest.current(files, target?.closest(`[${FILE_DROP_ATTRIBUTE}]`) ?? null);
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
