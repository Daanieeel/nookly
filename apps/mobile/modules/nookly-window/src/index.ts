import { requireOptionalNativeModule } from "expo";

interface NativeWindow {
  controlsInset(): { left: number; top: number };
  requestOrientation(name: "portrait" | "landscape"): Promise<void>;
}

// Missing in a build without the module (tests, Android).
const native = requireOptionalNativeModule<NativeWindow>("NooklyWindow");

/// The room iPadOS keeps at the window's top left for its window controls, past the safe
/// area; zero when they do not show.
export function windowControlsInset(): { left: number; top: number } {
  return native?.controlsInset() ?? { left: 0, top: 0 };
}

/// Turns the window (development checks only).
export async function requestOrientation(name: "portrait" | "landscape"): Promise<void> {
  await native?.requestOrientation(name);
}
