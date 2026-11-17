import { Platform } from "react-native";
import { useIsTablet } from "./pane.tsx";

/// What the copy calls the device in someone's hand: "this iPad", "a new iPhone".
export type DeviceWord = "iPhone" | "iPad" | "phone" | "tablet";

/// Apple's names on iOS, the plain words on Android.
export function deviceWord(tablet: boolean, os: string = Platform.OS): DeviceWord {
  if (os === "ios") return tablet ? "iPad" : "iPhone";
  return tablet ? "tablet" : "phone";
}

/// The device's name, by the window, so the copy matches the shell around it. An iPad stays
/// an iPad in a narrow window.
export function useDeviceWord(): DeviceWord {
  const wide = useIsTablet();
  return deviceWord(wide || (Platform.OS === "ios" && Platform.isPad));
}
