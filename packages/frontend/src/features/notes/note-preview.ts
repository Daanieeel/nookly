const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const PAIRED_MARKS = /(\*\*|__|~~|==)(.+?)\1/g;
const SINGLE_MARKS = /(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g;
const INLINE_CODE = /`([^`]+)`/g;
const LINE_PREFIX = /^\s*(?:#{1,3}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|\[[ xX]\]\s+)/;

/// Plain text lines of a `PageSummary.preview`: inline markdown dropped, mentions
/// and links reduced to their text, empty lines skipped.
export function previewLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(LINE_PREFIX, "")
        .replace(LINK, "$1")
        .replace(INLINE_CODE, "$1")
        .replace(PAIRED_MARKS, "$2")
        .replace(SINGLE_MARKS, "$1$2")
        .replaceAll("\\$", "$")
        .trim(),
    )
    .filter(Boolean);
}

/// Plain text for a list row from `PageSummary.preview`, with a leading line that
/// only repeats the title skipped so the snippet shows real body text.
export function notePreviewText(markdown: string, title: string): string {
  const lines = previewLines(markdown);
  if (lines[0]?.toLowerCase() === title.trim().toLowerCase()) lines.shift();
  return lines.join(" ");
}
