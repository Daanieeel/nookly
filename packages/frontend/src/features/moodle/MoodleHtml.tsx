import { openUrl } from "@tauri-apps/plugin-opener";
import { useMemo } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { cleanMoodleHtml } from "./moodle-html.ts";

/// Moodle's HTML, cleaned (`moodle-html.ts`). Links open in the browser, never in the app.
export function MoodleHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => cleanMoodleHtml(html), [html]);
  return (
    <div
      className={cn(
        "text-sm/relaxed wrap-break-word [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      role="presentation"
      onClick={(event) => {
        const link = event.target instanceof Element ? event.target.closest("a") : null;
        if (!link) return;
        event.preventDefault();
        const href = link.getAttribute("href");
        if (href && /^(https?|mailto):/i.test(href)) void openUrl(href);
      }}
      // SAFETY: `cleanMoodleHtml` allows a short list of text tags and no scripts, styles,
      // frames, forms or event handlers, and only web and mail links.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
