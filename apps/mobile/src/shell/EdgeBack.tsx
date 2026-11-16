import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { EDGE_BACK, FADE, SPRING, rubberBand, settleEdgeBack } from "../ui/motion.ts";
import { useReduceMotion } from "../ui/reduce-motion.ts";

/// A page that goes back on a swipe from its left edge (1.10): it follows the finger with
/// the page before showing behind it, and a release past a third, or a flick, carries it
/// off to the right. With nothing to go back to, the swipe calls `onEdge` instead (a medium
/// window opens its sidebar), or resists.
export function EdgeBack({
  width,
  canGoBack,
  onBack,
  onEdge,
  behind,
  children,
}: {
  width: number;
  canGoBack: boolean;
  onBack: () => void;
  onEdge?: () => void;
  /// The page before, drawn only while the swipe shows it.
  behind: ReactNode;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const x = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const finish = (back: boolean) => {
    if (back) onBack();
    x.value = 0;
    setDragging(false);
  };
  const edge = () => onEdge?.();
  const pan = Gesture.Pan()
    .withTestId("edge-back")
    .enabled(canGoBack || onEdge !== undefined)
    .hitSlop({ left: 0, width: EDGE_BACK.edge })
    .activeOffsetX(10)
    .failOffsetY([-12, 12])
    .onStart(() => {
      if (canGoBack) runOnJS(setDragging)(true);
    })
    .onUpdate((event) => {
      const offset = Math.max(0, event.translationX);
      x.value = canGoBack ? offset : rubberBand(offset, width) / 4;
    })
    .onEnd((event) => {
      if (!canGoBack) {
        x.value = withSpring(0, SPRING.sheet);
        if (event.translationX > 40 || event.velocityX > EDGE_BACK.flick) runOnJS(edge)();
        return;
      }
      const back = settleEdgeBack({
        offset: event.translationX,
        velocity: event.velocityX,
        width,
      });
      const done = (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(finish)(back);
      };
      x.value = reduce
        ? withTiming(back ? width : 0, { duration: FADE.out }, done)
        : withSpring(back ? width : 0, { ...SPRING.sheet, velocity: event.velocityX }, done);
    });
  const page = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // The page before darkens less as the one on top uncovers it, as iOS's.
  const shade = useAnimatedStyle(() => ({ opacity: 0.12 * (1 - Math.min(1, x.value / width)) }));
  return (
    <GestureDetector gesture={pan}>
      <View className="flex-1 overflow-hidden">
        {dragging ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {behind}
            <Animated.View style={[StyleSheet.absoluteFill, shade]} className="bg-black" />
          </View>
        ) : null}
        <Animated.View style={[{ flex: 1 }, page]} className="bg-card">
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
