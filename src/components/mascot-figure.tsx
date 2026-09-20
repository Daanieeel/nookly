import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import { format, getISOWeek, getISOWeekYear } from "date-fns";

export function getWeekYear() {
  const now = new Date();
  return { week: getISOWeek(now), year: getISOWeekYear(now) };
}

/// Seeded with today's date (not a fixed constant) so the mascot is a new blob
/// every day, same blob all day — and the same seed everywhere this resolves
/// to the same character, whether footer or Dashboard.
export function getMascotName(): string {
  return `Day_${format(new Date(), "yyyy-MM-dd")}`;
}

export function MascotFigure({ size, className }: { size: number; className?: string }) {
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
  return (
    <Blobatar ref={ref} name={getMascotName()} size={size} animate="always" className={className} />
  );
}
