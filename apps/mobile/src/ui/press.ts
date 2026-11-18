import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { PRESS_SCALE, SPRING } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";

/// A `Pressable` that can move: buttons and chips give way under a finger.
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/// The press of iOS's own buttons: it gives way a little under the finger and springs back
/// on release, from wherever it is. Nothing moves under Reduce Motion.
export function usePressScale(to: number = PRESS_SCALE) {
  const still = useReduceMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (!still) scale.value = withSpring(to, SPRING.press);
    },
    onPressOut: () => {
      scale.value = withSpring(1, SPRING.press);
    },
  };
}
