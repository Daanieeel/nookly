import { create } from "zustand";
import type { WindowSize } from "./pane.tsx";

/// A window size for development checks only (`hooks.window(...)`): the simulators here
/// cannot be turned or resized, so the app lays itself out at this size instead, scaled
/// to fit the screen. Nothing sets it outside end to end checks.
export const useWindowOverride = create<{ size: WindowSize | null }>(() => ({ size: null }));

export function setWindowOverride(size: WindowSize | null) {
  useWindowOverride.setState({ size });
}
