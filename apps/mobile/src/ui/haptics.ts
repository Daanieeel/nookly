import { z } from "zod";
import {
  type HapticEvent,
  type HapticFallback,
  playHaptic,
} from "../../modules/nookly-haptics/src/index.ts";
import { readPreference } from "../data/preferences.ts";

/// Nookly's haptics, one set designed together: every pattern is a few beats on the Taptic
/// Engine that match the motion they go with, kept subtle. Screens name a pattern
/// (`haptic("toggle")`) and never touch the engine.
interface HapticPattern {
  events: HapticEvent[];
  /// What plays instead where Core Haptics cannot run.
  fallback: HapticFallback;
  /// How much it matters: a stronger pattern gets through right after a weaker one, a
  /// weaker one right after a stronger is folded into it.
  weight: number;
  /// The least time between two of the same, in milliseconds.
  gap: number;
}

const beat = (time: number, intensity: number, sharpness: number): HapticEvent => ({
  kind: "transient",
  time,
  intensity,
  sharpness,
});

export const HAPTIC_PATTERNS = {
  /// A light press on something that acts at once.
  tap: { events: [beat(0, 0.45, 0.5)], fallback: "light", weight: 1, gap: 60 },
  /// A soft tick as a picker's or a select's value changes.
  select: { events: [beat(0, 0.35, 0.8)], fallback: "selection", weight: 1, gap: 60 },
  /// A crisp click as a switch or a checkbox flips.
  toggle: { events: [beat(0, 0.6, 0.9)], fallback: "rigid", weight: 2, gap: 80 },
  /// A light bump as a drawer or the sidebar opens, or a drag crosses a row.
  open: { events: [beat(0, 0.3, 0.3)], fallback: "soft", weight: 1, gap: 120 },
  /// A thud as a sheet settles on a stop.
  detent: { events: [beat(0, 0.55, 0.2)], fallback: "medium", weight: 2, gap: 120 },
  /// A firmer thud at a limit: a drag that can go no further, a swipe that will act.
  edge: { events: [beat(0, 0.7, 0.1)], fallback: "heavy", weight: 2, gap: 160 },
  /// A rising double tap as a task is done.
  complete: {
    events: [beat(0, 0.35, 0.4), beat(0.07, 0.75, 0.7)],
    fallback: "success",
    weight: 3,
    gap: 150,
  },
  /// Something finished well: saved, synced, signed in.
  success: {
    events: [beat(0, 0.5, 0.5), beat(0.1, 0.8, 0.8)],
    fallback: "success",
    weight: 3,
    gap: 400,
  },
  /// Something needs a look: a conflict, a change to review.
  warning: {
    events: [beat(0, 0.6, 0.3), beat(0.12, 0.6, 0.3)],
    fallback: "warning",
    weight: 4,
    gap: 400,
  },
  /// Something failed.
  error: {
    events: [beat(0, 0.8, 0.6), beat(0.09, 0.8, 0.6), beat(0.18, 0.9, 0.9)],
    fallback: "error",
    weight: 5,
    gap: 400,
  },
} satisfies Record<string, HapticPattern>;

export type HapticName = keyof typeof HAPTIC_PATTERNS;

const isHapticName = (key: string): key is HapticName => key in HAPTIC_PATTERNS;

/// Every pattern's name.
export const HAPTIC_NAMES: HapticName[] = Object.keys(HAPTIC_PATTERNS).filter(isHapticName);

/// Within this many milliseconds of the last pattern, only a stronger one plays.
const COALESCE = 80;

interface HapticsDeps {
  now: () => number;
  enabled: () => boolean;
  play: (events: HapticEvent[], fallback: HapticFallback) => void;
}

/// The player with its rate limit: a repeat that comes too soon is dropped, and patterns
/// that arrive together are folded into the strongest, so scrolling never buzzes.
export function createHaptics({ now, enabled, play }: HapticsDeps): (name: HapticName) => void {
  let last: { at: number; weight: number } | null = null;
  const lastOf = new Map<HapticName, number>();
  return (name) => {
    const pattern: HapticPattern = HAPTIC_PATTERNS[name];
    const at = now();
    if (last && at - last.at < COALESCE && pattern.weight <= last.weight) return;
    const previous = lastOf.get(name);
    if (previous !== undefined && at - previous < pattern.gap) return;
    if (!enabled()) return;
    last = { at, weight: pattern.weight };
    lastOf.set(name, at);
    play(pattern.events, pattern.fallback);
  };
}

/// The Settings switch: on unless turned off on this phone.
export const HAPTICS_PREFERENCE = "haptics.enabled";
export const hapticsPreference = z.boolean();

/// Where patterns are played: the Taptic Engine, or a recorder in tests.
export const hapticOutput: Pick<HapticsDeps, "play"> = { play: playHaptic };

/// Plays one of Nookly's patterns, if this phone has haptics on.
export const haptic = createHaptics({
  now: () => Date.now(),
  enabled: () => readPreference(HAPTICS_PREFERENCE, hapticsPreference, true),
  play: (events, fallback) => hapticOutput.play(events, fallback),
});

/// The name of the pattern these beats belong to.
export function patternOf(events: HapticEvent[]): HapticName | undefined {
  return HAPTIC_NAMES.find((name) => HAPTIC_PATTERNS[name].events === events);
}
