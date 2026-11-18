import { Platform } from "react-native";

/// The name end to end checks give this device (`tools/e2e/mobile.ts`): an iPad is
/// `tablet`, anything else what the bundle was started with, `phone` by default.
export function automationDevice(): string {
  if (Platform.OS === "ios" && Platform.isPad) return "tablet";
  return process.env.EXPO_PUBLIC_AUTOMATION_DEVICE ?? "phone";
}
