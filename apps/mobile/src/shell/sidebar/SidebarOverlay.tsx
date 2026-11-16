import { type ReactNode, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { FADE, SPRING, rubberBand } from "../../ui/motion.ts";
import { useReduceMotion } from "../../ui/reduce-motion.ts";
import { pushLayer } from "../../ui/sheet/layers.ts";

/// How far from the window's left edge a swipe opens the sidebar.
export const EDGE = 24;

/// The sidebar laid over the page in a medium window: it slides in from the left over a
/// dimmed page, follows the finger both ways, and goes on a pick or a tap on the dim. The
/// details pane over a narrow page comes the same way from the right (`side`).
export function SidebarOverlay({
  open,
  onOpenChange,
  width,
  top,
  side = "left",
  label = "Close Sidebar",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  /// Where it starts: under the titlebar.
  top: number;
  side?: "left" | "right";
  /// What the dim says it does.
  label?: string;
  children: ReactNode;
}) {
  // Away from its edge is negative on the left and positive on the right.
  const sign = side === "left" ? 1 : -1;
  const reduce = useReduceMotion();
  // 0 closed, 1 open.
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    progress.value = reduce
      ? withTiming(open ? 1 : 0, { duration: open ? FADE.in : FADE.out })
      : withSpring(open ? 1 : 0, SPRING.sheet);
  }, [open, reduce, progress]);
  const setOpen = (next: boolean) => onOpenChange(next);
  // Escape closes it, as it does a popover.
  const close = useRef(() => onOpenChange(false));
  useEffect(() => {
    close.current = () => onOpenChange(false);
  });
  useEffect(() => {
    if (!open) return;
    const layer = pushLayer(() => close.current());
    return layer.remove;
  }, [open]);
  const drag = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      const toward = event.translationX * sign;
      progress.value =
        toward > 0 ? 1 + rubberBand(toward, width) / width : 1 + Math.min(0, toward) / width;
    })
    .onEnd((event) => {
      const toward = event.translationX * sign;
      const speed = event.velocityX * sign;
      const close = speed < -500 || (toward < -width / 3 && speed < 300);
      progress.value = withSpring(close ? 0 : 1, {
        ...SPRING.sheet,
        velocity: -speed / width,
      });
      if (close) runOnJS(setOpen)(false);
    });
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-sign * (width + 16), 0]) }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }));
  return (
    <View pointerEvents={open ? "auto" : "box-none"} style={[StyleSheet.absoluteFill, { top }]}>
      <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, dim]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          className="flex-1 bg-black/20"
          onPress={() => setOpen(false)}
        />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View
          accessibilityViewIsModal={open}
          onAccessibilityEscape={() => setOpen(false)}
          className={
            side === "left"
              ? "absolute bottom-0 left-0 border-r border-sidebar-border bg-background shadow-md"
              : "absolute bottom-0 right-0 border-l border-sidebar-border bg-background shadow-md"
          }
          style={[{ width, top: 0 }, panel]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
