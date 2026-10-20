import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, type ReactNode } from "react";

/// A link, bold, italic or code span; the only inline formatting the notes use.
const INLINE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/// `**bold**`, `*italic*`, `` `code` `` and `[web links](https://…)` inside a line, drawn by
/// hand. A link to anything but a web address is shown as its text. Cheap enough to draw
/// hundreds of lines at once, which a note editor per line is not.
export function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = LINK.exec(part);
    if (link?.[1] && link[2]) {
      const [, label, href] = link;
      if (!/^https?:\/\//i.test(href)) return <Fragment key={index}>{label}</Fragment>;
      return (
        <a
          key={index}
          href={href}
          className="text-primary underline underline-offset-2"
          onClick={(event) => {
            event.preventDefault();
            void openUrl(href).catch(() => undefined);
          }}
        >
          {label}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
