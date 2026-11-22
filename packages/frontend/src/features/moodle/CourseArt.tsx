import { type ReactNode, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleCourse } from "#/lib/api/moodle.ts";
import { useMoodleImage } from "./moodle-queries.ts";

/// Gradients for courses without a banner, so every course still has a look of its own.
const PALETTES = [
  "from-accent-blue/30 to-accent-purple/20",
  "from-accent-green/30 to-accent-blue/20",
  "from-accent-pink/30 to-accent-purple/20",
  "from-accent-yellow/30 to-accent-pink/20",
  "from-accent-purple/30 to-accent-blue/20",
  "from-accent-green/30 to-accent-yellow/20",
] as const;

/// The same course always gets the same colors.
function paletteOf(courseId: number): string {
  return PALETTES[Math.abs(courseId) % PALETTES.length] ?? PALETTES[0];
}

/// A course's banner from Moodle, or its soft colors when it has none. The colors
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
