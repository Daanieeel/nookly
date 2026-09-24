import { useLayoutEffect, useRef } from "react";
import { renderMath } from "@/features/notes/math";
import { cn } from "@/lib/utils";

/// `**bold**`, `*italic*`, `` `code` `` and `$math$`, the inline markdown a card face holds.
const INLINE = /(\$[^$\n]+\$|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export function CardText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(INLINE);
  return (
    <span className={cn("whitespace-pre-wrap wrap-break-word", className)}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith("$")) return <InlineMath key={i} latex={part.slice(1, -1)} />;
        if (part.startsWith("`"))
          return (
            <code key={i} className="rounded-sm bg-accent px-1 py-0.5 index-card-code font-mono">
              {part.slice(1, -1)}
            </code>
          );
        if (part.startsWith("**"))
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        return <em key={i}>{part.slice(1, -1)}</em>;
      })}
    </span>
  );
}

function InlineMath({ latex }: { latex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const error = renderMath(latex, ref.current, false);
    if (error) ref.current.textContent = `$${latex}$`;
  }, [latex]);
  return <span ref={ref} />;
}

/// Short prompts read large, like a word written across a real card; long ones shrink to fit.
export function faceTextSize(text: string): string {
  if (text.length <= 40) return "text-2xl leading-snug";
  if (text.length <= 120) return "text-lg leading-snug";
  return "text-base leading-relaxed";
}
