import { Platform, View, useWindowDimensions } from "react-native";
import { useDrawerProgress } from "react-native-drawer-layout";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { PAGE_PANE_CLASSES } from "@nookly/frontend/classes";
import { cn } from "./classes.ts";

/// The page's corners, like the screen's own, so they only show once it slides aside.
const PAGE_RADIUS = Platform.select({ ios: 38, default: 24 });

/// The page's outline, the desktop page pane's (`PAGE_PANE_CLASSES`).
export const PAGE_OUTLINE = PAGE_PANE_CLASSES.split(" ")
  .filter((name) => name === "border" || /^border-[a-z-]+$/.test(name))
  .join(" ");

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
/// shadow onto the sidebar. With the sidebar hidden, neither shows. The details on the
/// right (`side="right"`) draw it the same way, the page sliding to the left.
export function PageEdge({
  drawerWidth,
  dark,
  side = "left",
}: {
  drawerWidth: number;
  dark: boolean;
  side?: "left" | "right";
}) {
  const progress = useDrawerProgress();
  const { width, height } = useWindowDimensions();
  const right = side === "right";
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: (right ? -1 : 1) * progress.value * drawerWidth }],
    opacity: progress.value > 0 ? 1 : 0,
  }));
  return (
    <Animated.View
      testID="page-edge"
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: -OUTLINE,
          // A drawer on the right starts where the page leaves room for it.
          left: -OUTLINE - (right ? width - drawerWidth : 0),
          width: width + OUTLINE * 2,
          height: height + OUTLINE * 2,
          borderRadius: PAGE_RADIUS + OUTLINE,
          borderCurve: "continuous",
          boxShadow: right ? pageShadow(dark).replace("-8px", "8px") : pageShadow(dark),
        },
        slide,
      ]}
    >
      <View
        className={cn("flex-1", PAGE_OUTLINE)}
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
