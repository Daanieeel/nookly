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

/// The mascot's name, which picks its look: seeded with today's date (not a fixed
/// constant), so it is a new blob every day and the same blob all day, on every screen and
/// on every device.
export function mascotName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Day_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/// `mad` deliberately excluded: the mascot is a helper, never cross with you.
export const MASCOT_EMOTIONS = [
  happy,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  shy,
  sick,
  thinking,
];

const EMOTION_CYCLE_MS = 8_000;

/// Module level clock, not per component state: every mascot on screen reads the same
/// index off one shared interval, so they change expression in the same frame instead of
/// drifting apart on their own timers. The interval runs only while something is
/// subscribed and stops once the last mascot unmounts.
let emotionIndex = 0;
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | undefined;

export function subscribeToMascotEmotion(callback: () => void): () => void {
  subscribers.add(callback);
  if (intervalId === undefined) {
    intervalId = setInterval(() => {
      emotionIndex = (emotionIndex + 1) % MASCOT_EMOTIONS.length;
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

export function mascotEmotionIndex(): number {
  return emotionIndex;
}
