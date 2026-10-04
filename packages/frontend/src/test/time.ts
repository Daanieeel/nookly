import { vi } from "vitest";
import { type DateTimeSettings, useDateTimeSettings } from "#/lib/datetime.ts";

/// Freezes "now" at `iso` (local time; tests run in UTC) while timers keep running,
/// so React and Testing Library still work. The shared setup restores real time.
export function freezeTime(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

/// Sets the device's date and time format for a test.
export function setDateTimeSettings(patch: Partial<DateTimeSettings>) {
  useDateTimeSettings.setState(patch);
}
