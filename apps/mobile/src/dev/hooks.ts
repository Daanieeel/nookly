import { Dimensions } from "react-native";
import { requestOrientation, windowControlsInset } from "../../modules/nookly-window/src/index.ts";
import { setWindowOverride } from "../ui/window-override.ts";

/// Actions a script of `tools/e2e/mobile.ts` can call by name (`hooks.openSidebar()`), for
/// what sits outside the React tree the scripts walk, like the native bar's buttons. The
/// app registers them; nothing calls them outside end to end checks.
export const devHooks: Record<string, (...args: never[]) => unknown> = {
  /// Turns the window (`hooks.rotate("landscape")`): the simulators here have no window to
  /// turn by hand.
  rotate: (orientation: "portrait" | "landscape") => requestOrientation(orientation),
  /// The window's size in points, to check a turn took.
  windowSize: () => Dimensions.get("window"),
  /// Where iPadOS keeps its window controls.
  controlsInset: () => windowControlsInset(),
  /// Lays the app out as in a window of this size (`hooks.window(1376, 1032)` for a 13-inch
  /// iPad in landscape, `hooks.window()` for the real window), scaled to fit the screen:
  /// the simulators here run apps in windows that only the device's turn can change.
  window: (width?: number, height?: number) =>
    setWindowOverride(width && height ? { width, height } : null),
};
