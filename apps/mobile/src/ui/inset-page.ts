import { useDrawerProgress } from "expo-router/drawer";
import { Platform, StyleSheet } from "react-native";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { create } from "zustand";

/// Whether the page has moved aside for the sidebar, even a little.
export const usePageAside = create<{ aside: boolean }>(() => ({ aside: false }));

const setAside = (aside: boolean) => usePageAside.setState({ aside });

/// Watches the sidebar's progress from inside the drawer, so the page knows the moment
/// it starts to slide, during a swipe too.
export function useWatchPageAside() {
  const progress = useDrawerProgress();
  useAnimatedReaction(
    () => progress.value > 0,
    (aside, before) => {
      if (aside !== before) scheduleOnRN(setAside, aside);
    },
  );
}

/// The page over the sidebar, like Claude's: rounded like the screen's own corners, so
/// the rounding only shows once it slides aside, and outlined then, so it reads as
/// lying on top of the sidebar.
export function insetPageStyle(aside: boolean, colors: { background: string; border: string }) {
  return {
    backgroundColor: colors.background,
    borderRadius: Platform.select({ ios: 38, default: 24 }),
    borderCurve: "continuous" as const,
    overflow: "hidden" as const,
    borderWidth: aside ? StyleSheet.hairlineWidth * 2 : 0,
    borderColor: colors.border,
  };
}
