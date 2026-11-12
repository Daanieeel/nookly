import { AnimatedBlobatar } from "@blobatar/react-native/animated";
import {
  MASCOT_EMOTIONS,
  mascotEmotionIndex,
  mascotName,
  subscribeToMascotEmotion,
} from "@nookly/frontend/lib/mascot";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { useReduceMotion } from "./reduce-motion.ts";

/// The mascot, the desktop's (`MascotFigure`): today's blob, the same on every screen and
/// device, changing its expression with every other mascot on the same clock. It moves
/// only while `animate` says it is in view, and stands still under Reduce Motion.
export function Mascot({ size, animate = true }: { size: number; animate?: boolean }) {
  const index = useSyncExternalStore(subscribeToMascotEmotion, mascotEmotionIndex);
  const still = useReduceMotion();
  return (
    <View
      testID="mascot"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AnimatedBlobatar
        name={mascotName()}
        size={size}
        animate={animate && !still}
        expression={MASCOT_EMOTIONS[index]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}
