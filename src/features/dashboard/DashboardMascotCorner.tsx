import type { CSSProperties } from "react";
import { MascotFigure } from "@/components/mascot-figure";

/// A cloud-shaped badge tucked near the content card's top-right corner —
/// an organic blob silhouette (asymmetric `border-radius`) rather than a
/// rectangle, so it doesn't need to align precisely with the card's own
/// corner radius or any concave fillet to look intentional.
export function DashboardMascotCorner() {
  return (
    <div
      className="absolute top-3 right-3 z-10 flex size-28 items-center justify-center rounded-(--blob-radius) bg-black"
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
