import { AppState } from "react-native";

/// The parts of React Native's `AppState` used here.
export interface AppStateLike {
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/// Tells `sync` the phone is back each time the app comes to the front: iOS closes the
/// app's connections in the background, and the phone finds the server at once instead of
/// waiting out a retry. Returns how to stop listening.
export function resumeWhenActive(
  sync: { resume(): void },
  appState: AppStateLike = AppState,
): () => void {
  const subscription = appState.addEventListener("change", (state) => {
    if (state === "active") sync.resume();
  });
  return () => subscription.remove();
}
