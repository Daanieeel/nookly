import { useDrawerProgress } from "expo-router/drawer";
import { Platform, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

/// The page's corners, like the screen's own, so they only show once it slides aside.
const PAGE_RADIUS = Platform.select({ ios: 38, default: 24 });

/// How far the outline reaches past the page's edge.
const OUTLINE = 1;

/// The shadow the page casts to its left, onto the sidebar, deeper in the dark theme
/// where a light one wouldn't show.
export function pageShadow(dark: boolean): string {
  return `-8px 0 24px -4px rgba(0, 0, 0, ${dark ? 0.45 : 0.1})`;
}

/// The page's outline and shadow, drawn from the sidebar's side. The page can't draw
/// them itself: the screen container around it clips everything outside its edge. So
/// a shape one outline wider than the page sits under it in the sidebar and follows
/// its slide: its border shows as a thin ring around the page's edge, and it casts the
/// shadow onto the sidebar. With the sidebar hidden, neither shows.
export function PageEdge({ drawerWidth, dark }: { drawerWidth: number; dark: boolean }) {
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
          top: -OUTLINE,
          left: -OUTLINE,
          width: width + OUTLINE * 2,
          height: height + OUTLINE * 2,
          borderRadius: PAGE_RADIUS + OUTLINE,
          borderCurve: "continuous",
          boxShadow: pageShadow(dark),
        },
        slide,
      ]}
    >
      <View
        className="flex-1 border border-border"
        style={{ borderRadius: PAGE_RADIUS + OUTLINE, borderCurve: "continuous" }}
      />
    </Animated.View>
  );
}

/// The page over the sidebar, like Claude's: rounded like the screen's own corners, so
/// the rounding only shows once it slides aside. `PageEdge` draws its outline and shadow.
export function insetPageStyle(background: string) {
  return {
    backgroundColor: background,
    borderRadius: PAGE_RADIUS,
    borderCurve: "continuous" as const,
    overflow: "hidden" as const,
  };
}
