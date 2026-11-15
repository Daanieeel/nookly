import { type ReactNode, useEffect } from "react";
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

/// How far from the window's left edge a swipe opens the sidebar.
export const EDGE = 24;

/// The sidebar laid over the page in a medium window: it slides in from the left over a
/// dimmed page, follows the finger both ways, and goes on a pick or a tap on the dim.
export function SidebarOverlay({
  open,
  onOpenChange,
  width,
  top,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  /// Where it starts: under the titlebar.
  top: number;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  // 0 closed, 1 open.
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    progress.value = reduce
      ? withTiming(open ? 1 : 0, { duration: open ? FADE.in : FADE.out })
      : withSpring(open ? 1 : 0, SPRING.sheet);
  }, [open, reduce, progress]);
  const setOpen = (next: boolean) => onOpenChange(next);
  const drag = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      const x = Math.min(0, event.translationX);
      const opened = 1 + x / width;
      progress.value =
        event.translationX > 0 ? 1 + rubberBand(event.translationX, width) / width : opened;
    })
    .onEnd((event) => {
      const close =
        event.velocityX < -500 || (event.translationX < -width / 3 && event.velocityX < 300);
      progress.value = withSpring(close ? 0 : 1, {
        ...SPRING.sheet,
        velocity: -event.velocityX / width,
      });
      if (close) runOnJS(setOpen)(false);
    });
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-width - 16, 0]) }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }));
  return (
    <View pointerEvents={open ? "auto" : "box-none"} style={[StyleSheet.absoluteFill, { top }]}>
      <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, dim]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Sidebar"
          className="flex-1 bg-black/20"
          onPress={() => setOpen(false)}
        />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View
          accessibilityViewIsModal={open}
          className="absolute bottom-0 left-0 border-r border-sidebar-border bg-background shadow-md"
          style={[{ width, top: 0 }, panel]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
