import { type ReactNode, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleCourse } from "#/lib/api/moodle.ts";
import { useMoodleImage } from "./moodle-queries.ts";

/// Gradients for courses without a banner, so every course still has a look of its own.
const PALETTES = [
  "from-accent-blue/50 to-accent-purple/40",
  "from-accent-green/50 to-accent-blue/40",
  "from-accent-pink/50 to-accent-purple/40",
  "from-accent-yellow/50 to-accent-pink/40",
  "from-accent-purple/50 to-accent-blue/40",
  "from-accent-green/50 to-accent-yellow/40",
] as const;

/// The same course always gets the same colors.
function paletteOf(courseId: number): string {
  return PALETTES[Math.abs(courseId) % PALETTES.length] ?? PALETTES[0];
}

/// A course's banner from Moodle, or its colors with a few rings when it has none. The colors
/// show while the banner is on its way and stay under it.
export function CourseArt({
  course,
  className,
  children,
}: {
  course: Pick<MoodleCourse, "id" | "overviewFiles">;
  className?: string;
  children?: ReactNode;
}) {
  const banner = useMoodleImage(course.overviewFiles[0]);
  const [shown, setShown] = useState(false);
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-linear-to-br",
        paletteOf(course.id),
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-16 -right-10 size-56 rounded-full border border-foreground/10" />
        <div className="absolute -top-28 -right-24 size-80 rounded-full border border-foreground/10" />
        <div className="absolute -bottom-20 -left-12 size-48 rounded-full bg-foreground/5" />
      </div>
      {banner.data && (
        <img
          src={banner.data}
          alt=""
          onLoad={() => setShown(true)}
          className={cn(
            "absolute inset-0 -z-10 size-full object-cover transition-opacity duration-500",
            shown ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {children}
    </div>
  );
}
