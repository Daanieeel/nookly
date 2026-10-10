import { cn } from "@nookly/ui/lib/utils";
import { MarkdownViewer } from "#/features/files/MarkdownViewer.tsx";
import { localizeShortcuts } from "#/lib/shortcut-text.ts";

/// A line of the notes drawn by the note editor's own markdown renderer, so bold, code,
/// lists and links look as they do everywhere else in Nookly. A shortcut written in code
/// (`Mod+Shift+J`) is shown the way this system writes it.
export function Rich({ text, className }: { text: string; className?: string }) {
  // The note editor keeps a gutter on the left for its block handles and spaces its
  // paragraphs; neither belongs in a line of notes.
  return (
    <MarkdownViewer
      text={localizeShortcuts(text)}
      spaceId=""
      className={cn("pl-0 [&_p]:my-0", className)}
    />
  );
}
