import type { CSSProperties } from "react";
import { MascotFigure } from "@/components/mascot-figure";
import { cn } from "@/lib/utils";

/// A cloud-shaped badge bleeding off the content card's top-right corner —
/// an organic blob silhouette (asymmetric `border-radius`) floated so the
/// narrative briefing text flows and wraps cleanly around it.
export function DashboardMascotCorner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "float-right -mt-10 -mr-10 ml-6 mb-3 flex size-32 items-center justify-center rounded-(--blob-radius) bg-black [shape-outside:circle(48%)] [shape-margin:12px] select-none",
        className,
      )}
      // SAFETY: `--blob-radius` only ever receives this fixed organic-blob
      // shorthand — `CSSProperties` just doesn't model custom properties, and
      // `border-radius` has no themed scale that expresses a multi-corner
      // elliptical blob shape.
      style={{ "--blob-radius": "42% 58% 65% 35% / 55% 45% 55% 45%" } as CSSProperties}
    >
      <MascotFigure size={72} />
    </div>
  );
}
