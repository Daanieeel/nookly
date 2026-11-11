import { cn } from "@nookly/ui/lib/utils";
import { localizeShortcuts } from "#/lib/shortcut-text.ts";
import { inline } from "./InlineText.tsx";

type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

/// Lines of notes as paragraphs and bullet lists; a blank line ends a paragraph.
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (bullet?.[1] !== undefined) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else {
      blocks.push({ kind: "p", text: line });
    }
  }
  return blocks;
}

/// A line of the notes with bold, italic, code, web links and bullet lists. A shortcut
/// written in code (`Mod+Shift+J`) is shown the way this system writes it. Drawn by hand, not
/// by a note editor: the history dialog holds hundreds of these, and an editor each made it
/// slow to open.
export function Rich({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-sm/relaxed", className)}>
      {blocksOf(localizeShortcuts(text)).map((block, index) =>
        block.kind === "p" ? (
          <p key={index}>{inline(block.text)}</p>
        ) : (
          <ul key={index} className="flex flex-col gap-1.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                />
                <span className="min-w-0">{inline(item)}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
