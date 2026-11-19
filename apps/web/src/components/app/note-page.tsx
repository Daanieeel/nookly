import { IconCheck, IconClipboardList } from "@tabler/icons-react";
import { EDITOR_BLOCK_CLASSES as EDITOR_BLOCK } from "@nookly/frontend/classes";
import { cn } from "@nookly/ui/lib/utils";
import { samples } from "@/content/samples";
import type { Locale } from "@/lib/i18n";

/// A note as the editor shows it: blocks one under the other, a mention as a chip that
/// links to the page it names.
export function NotePageMock({ locale, className }: { locale: Locale; className?: string }) {
  const s = samples(locale).note;
  return (
    <div aria-hidden className={cn("flex flex-col gap-3 px-6 py-5 select-none", className)}>
      <div>
        <p className="font-display text-2xl font-semibold">{s.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{s.meta}</p>
      </div>
      <p className={EDITOR_BLOCK.heading3}>{s.heading}</p>
      <p className={cn(EDITOR_BLOCK.paragraph, "leading-relaxed")}>
        {s.paragraphBefore}
        <span className="inline-flex translate-y-0.5 items-center gap-1 rounded-sm bg-accent px-1 py-px align-baseline text-sm font-medium">
          <IconClipboardList size={13} className="text-muted-foreground" />
          {s.mention}
        </span>
        {s.paragraphAfter}
      </p>
      <div className="flex flex-col gap-1.5">
        {s.checklist.map((item) => (
          <span key={item.text} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-[4px] border",
                item.done ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {item.done && <IconCheck size={11} stroke={3} />}
            </span>
            <span className={cn(item.done && "text-muted-foreground line-through")}>
              {item.text}
            </span>
          </span>
        ))}
      </div>
      <pre className={EDITOR_BLOCK.code}>
        <code>{s.code}</code>
      </pre>
    </div>
  );
}
