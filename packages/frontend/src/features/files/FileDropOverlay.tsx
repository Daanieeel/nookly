import { IconFileUpload } from "@tabler/icons-react";

/// Covers the Files page while a file is dragged over it, so it is clear that dropping
/// imports it. It never takes the pointer, so the drop lands on the page below.
export function FileDropOverlay() {
  return (
    <div
      data-testid="file-drop-overlay"
      className="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/80 text-sm font-medium backdrop-blur-sm"
    >
      <IconFileUpload size={32} className="text-primary" />
      Drop to import files
    </div>
  );
}
