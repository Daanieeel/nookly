import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import { getISOWeek, getISOWeekYear } from "date-fns";
import {
  MASCOT_EMOTIONS,
  mascotEmotionIndex,
  mascotName,
  subscribeToMascotEmotion,
} from "#/lib/mascot.ts";
import { useSyncExternalStore } from "react";

export function getWeekYear() {
  const now = new Date();
  return { week: getISOWeek(now), year: getISOWeekYear(now) };
}

export function MascotFigure({ size, className }: { size: number; className?: string }) {
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
  const index = useSyncExternalStore(subscribeToMascotEmotion, mascotEmotionIndex);

  return (
    <Blobatar
      ref={ref}
      name={mascotName()}
      size={size}
      animate="always"
      expression={MASCOT_EMOTIONS[index]}
      className={className}
    />
  );
}
