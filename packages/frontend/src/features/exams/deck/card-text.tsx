import { useLayoutEffect, useRef } from "react";
import { renderMath } from "#/features/notes/math.ts";
import { cn } from "@nookly/ui/lib/utils";

/// What a card face is made of, in the order it is written.
export type CardSegment =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "math"; latex: string; display: boolean }
  | { kind: "bold" | "italic"; children: CardSegment[] };

/// The inline markdown a card face holds: `$math$` (a `$` needs no space just inside it and
/// no digit right after the closing one, so "$5 and $10" stays text), `$$display math$$`
/// over any number of lines, the LaTeX spellings `\(…\)` and `\[…\]`, `` `code` ``,
/// `**bold**` and `*italic*`.
const TOKEN = new RegExp(
  [
    String.raw`\$\$(?<display>[\s\S]+?)\$\$`,
    String.raw`\\\[(?<bracket>[\s\S]+?)\\\]`,
    String.raw`\\\((?<paren>.+?)\\\)`,
    String.raw`(?<![\\$])\$(?<inline>[^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)`,
    "`(?<code>[^`\\n]+)`",
    String.raw`\*\*(?<bold>[^*\n]+)\*\*`,
    String.raw`\*(?<italic>[^*\n]+)\*`,
  ].join("|"),
  "g",
);

/// Plain text, where `\$` is a dollar sign and not the start of a formula.
const plain = (value: string): CardSegment => ({
  kind: "text",
  value: value.replaceAll("\\$", "$"),
});

export function splitCardText(text: string): CardSegment[] {
  const segments: CardSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) segments.push(plain(text.slice(last, match.index)));
    last = match.index + match[0].length;
    const { display, bracket, paren, inline, code, bold, italic } = match.groups ?? {};
    if (display !== undefined) segments.push({ kind: "math", latex: display, display: true });
    else if (bracket !== undefined) segments.push({ kind: "math", latex: bracket, display: true });
    else if (paren !== undefined) segments.push({ kind: "math", latex: paren, display: false });
    else if (inline !== undefined) segments.push({ kind: "math", latex: inline, display: false });
    else if (code !== undefined) segments.push({ kind: "code", value: code });
    else if (bold !== undefined) segments.push({ kind: "bold", children: splitCardText(bold) });
    else segments.push({ kind: "italic", children: splitCardText(italic ?? "") });
  }
  if (last < text.length) segments.push(plain(text.slice(last)));
  return segments;
}

/// Whether any of the text is formatted, so a preview has something to show.
export function hasMarkup(text: string): boolean {
  return splitCardText(text).some((segment) => segment.kind !== "text");
}

export function CardText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("whitespace-pre-wrap wrap-break-word", className)}>
      {renderSegments(splitCardText(text))}
    </span>
  );
}

function renderSegments(segments: CardSegment[]) {
  return segments.map((segment, i) => {
    switch (segment.kind) {
      case "text":
        return segment.value;
      case "math":
        return <Formula key={i} latex={segment.latex} display={segment.display} />;
      case "code":
        return (
          <code key={i} className="rounded-sm bg-accent px-1 py-0.5 index-card-code font-mono">
            {segment.value}
          </code>
        );
      case "bold":
        return (
          <strong key={i} className="font-semibold">
            {renderSegments(segment.children)}
          </strong>
        );
      case "italic":
        return <em key={i}>{renderSegments(segment.children)}</em>;
    }
  });
}

/// A formula that does not parse stays as typed, so a half written one is not lost.
function Formula({ latex, display }: { latex: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const error = renderMath(latex, ref.current, display);
    if (error) ref.current.textContent = display ? `$$${latex}$$` : `$${latex}$`;
  }, [latex, display]);
  return <span ref={ref} className={display ? "my-1 block text-center" : undefined} />;
}

/// Short prompts read large, like a word written across a real card; long ones shrink to fit.
export function faceTextSize(text: string): string {
  if (text.length <= 40) return "text-2xl leading-snug";
  if (text.length <= 120) return "text-lg leading-snug";
  return "text-base leading-relaxed";
}
