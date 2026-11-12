import { requireOptionalNativeModule } from "expo";

/// One beat of a pattern: a tap (`transient`) or a buzz of `duration` seconds
/// (`continuous`), `time` seconds after the start, intensity and sharpness from 0 to 1.
export interface HapticEvent {
  kind: "transient" | "continuous";
  time: number;
  duration?: number;
  intensity: number;
  sharpness: number;
}

/// The system feedback a pattern falls back to when the engine cannot run.
export type HapticFallback =
  | "selection"
  | "success"
  | "warning"
  | "error"
  | "light"
  | "soft"
  | "rigid"
  | "medium"
  | "heavy";

interface NativeHaptics {
  supported: boolean;
  prepare(): void;
  play(events: HapticEvent[], fallback: HapticFallback): void;
}

// Missing in a build without the module (Expo Go, tests, Android).
const native = requireOptionalNativeModule<NativeHaptics>("NooklyHaptics");

/// Whether this device has a Taptic Engine to play on (not an iPad, not the simulator).
export const hapticsSupported = native?.supported === true;

/// Wakes the engine ahead of a gesture, so its first beat is on time.
export function prepareHaptics(): void {
  if (hapticsSupported) native?.prepare();
}

/// Plays a pattern now.
export function playHaptic(events: HapticEvent[], fallback: HapticFallback): void {
  if (hapticsSupported) native?.play(events, fallback);
}
