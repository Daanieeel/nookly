import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import {
  happy,
  love,
  scared,
  shy,
  sick,
  sleepy,
  smug,
  surprised,
  thinking,
  unsure,
  wink,
} from "blobatar/expression";
import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { useSyncExternalStore } from "react";

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

/// `mad` deliberately excluded — the mascot is a helper, never cross with you.
const EMOTIONS = [happy, surprised, wink, sleepy, smug, unsure, scared, love, shy, sick, thinking];

const EMOTION_CYCLE_MS = 8_000;

/// Module-level clock, not per-component state — every mascot on screen (sidebar,
/// Dashboard corner, wherever else) reads the same index off one shared interval,
/// so they change expression in the same frame instead of drifting apart on their
/// own independently-mounted timers. Interval runs only while something is
/// subscribed and stops once the last mascot unmounts.
let emotionIndex = 0;
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | undefined;

function subscribeToEmotion(callback: () => void): () => void {
  subscribers.add(callback);
  if (intervalId === undefined) {
    intervalId = setInterval(() => {
      emotionIndex = (emotionIndex + 1) % EMOTIONS.length;
      for (const sub of subscribers) sub();
    }, EMOTION_CYCLE_MS);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };
}

function getEmotionIndex(): number {
  return emotionIndex;
}

export function MascotFigure({ size, className }: { size: number; className?: string }) {
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
  const index = useSyncExternalStore(subscribeToEmotion, getEmotionIndex);

  return (
    <Blobatar
      ref={ref}
      name={getMascotName()}
      size={size}
      animate="always"
      expression={EMOTIONS[index]}
      className={className}
    />
  );
}
