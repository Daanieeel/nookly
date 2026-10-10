import { cn } from "@nookly/ui/lib/utils";

/// How much of the end stays visible when the text is shortened: enough for a folder or
/// file name to stay recognisable.
const TAIL_CHARS = 16;

/// One line of text that, when it does not fit, is shortened in the middle (`/Users/some…
/// ation Support/agent`) so the start and the end both stay readable. The full text is
/// the tooltip and what a screen reader reads. Gives way to the width it is in, and
/// needs no measuring: the start shrinks with an ellipsis, the end never does.
export function MiddleEllipsis({ text, className }: { text: string; className?: string }) {
  const split = text.length > TAIL_CHARS ? text.length - TAIL_CHARS : 0;
  return (
    <span title={text} className={cn("flex min-w-0 max-w-full", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="flex min-w-0 max-w-full">
        <span className="truncate whitespace-pre">{text.slice(0, split)}</span>
        <span className="shrink-0 whitespace-pre">{text.slice(split)}</span>
      </span>
    </span>
  );
}
