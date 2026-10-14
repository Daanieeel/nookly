import { useDrawerProgress } from "expo-router/drawer";
import { Platform, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
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

/// The page's corners, like the screen's own, so they only show once it slides aside.
const PAGE_RADIUS = Platform.select({ ios: 38, default: 24 });

/// The shadow the page casts to its left, onto the sidebar, deeper in the dark theme
/// where a light one wouldn't show.
export function pageShadow(dark: boolean): string {
  return `-12px 0 32px -4px rgba(0, 0, 0, ${dark ? 0.7 : 0.18})`;
}

/// The page's shadow, drawn from the sidebar's side. The page can't cast it itself: the
/// screen container around it clips everything outside its edge. So an empty shape the
/// size of the page sits under it in the sidebar, follows its slide, and casts the
/// shadow onto the sidebar.
export function PageShadow({ drawerWidth, dark }: { drawerWidth: number; dark: boolean }) {
  const progress = useDrawerProgress();
  const { width, height } = useWindowDimensions();
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * drawerWidth }],
    opacity: progress.value > 0 ? 1 : 0,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          borderRadius: PAGE_RADIUS,
          borderCurve: "continuous",
          boxShadow: pageShadow(dark),
        },
        slide,
      ]}
    />
  );
}

/// The page over the sidebar, like Claude's: rounded like the screen's own corners, so
/// the rounding only shows once it slides aside, then outlined, so it reads as lying on
/// top of the sidebar. `PageShadow` adds its shadow.
export function insetPageStyle(aside: boolean, colors: { background: string; border: string }) {
  return {
    backgroundColor: colors.background,
    borderRadius: PAGE_RADIUS,
    borderCurve: "continuous" as const,
    overflow: "hidden" as const,
    borderWidth: aside ? StyleSheet.hairlineWidth * 2 : 0,
    borderColor: colors.border,
  };
}
