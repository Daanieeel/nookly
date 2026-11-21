import type { GalleryEntry } from "@/gallery/types";
import type { Platform } from "./platform";

/// One component on a card: its name and file above, the live example below. The phone's
/// are drawn in a column as wide as a phone, since they are laid out for one.
export function Demo({ entry, platform }: { entry: GalleryEntry; platform: Platform }) {
  return (
    <section id={entry.id} aria-labelledby={`${entry.id}-title`} className="scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 id={`${entry.id}-title`} className="text-sm font-medium">
          {entry.name}
        </h3>
        <code className="text-xs text-muted-foreground">{entry.source}</code>
      </div>
      {entry.note && <p className="mb-2 text-xs text-muted-foreground">{entry.note}</p>}
      <div className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border bg-card p-5 shadow-card">
        {platform === "mobile" ? (
          <div className="flex w-full max-w-[390px] flex-col gap-3">{entry.render()}</div>
        ) : (
          entry.render()
        )}
      </div>
    </section>
  );
}
