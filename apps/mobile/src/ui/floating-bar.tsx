import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { PASTE_BAR, PASTE_BAR_MARGIN, usePasteBarLift } from "./FloatingField.tsx";
import { useElevation, useSemantic } from "./kit/scheme.ts";
import { FADE, SPRING } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { CORNER, SPACE } from "./tokens.ts";

/// A bar floating over the bottom of a page, as wide as its buttons (or `fill`): it rises on a spring as
/// it appears and sinks away after (the save bar, the way back to today).
export function FloatingBar({
  shown,
  above,
  testID,
  label,
  fill = false,
  children,
}: {
  shown: boolean;
  above: number;
  testID: string;
  label: string;
  /// Spans the page between the margins, as the paste bar does, instead of its buttons' width.
  fill?: boolean;
  children: React.ReactNode;
}) {
  const floating = useElevation("popover");
  const still = useReduceMotion();
  const card = useSemantic("sheetCard");
  const separator = useSemantic("separator");
  const lift = usePasteBarLift();
  const open = useSharedValue(0);
  const [present, setPresent] = useState(shown);
  useEffect(() => {
    if (shown) setPresent(true);
    const done = (finished?: boolean) => {
      "worklet";
      if (finished && !shown) runOnJS(setPresent)(false);
    };
    open.value = still
      ? withTiming(shown ? 1 : 0, { duration: shown ? FADE.in : FADE.out }, done)
      : withSpring(shown ? 1 : 0, SPRING.sheet, done);
  }, [shown, still, open]);
  const rise = useAnimatedStyle(() => ({
    opacity: still ? open.value : Math.min(1, open.value * 2),
    transform: [{ translateY: still ? 0 : (1 - open.value) * (PASTE_BAR.height + SPACE.xl) }],
  }));
  if (!present) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: PASTE_BAR_MARGIN,
          right: PASTE_BAR_MARGIN,
          bottom: lift + above,
          alignItems: "center",
        },
        rise,
      ]}
    >
      <View
        testID={testID}
        accessibilityLabel={label}
        style={[
          CORNER,
          floating,
          {
            borderRadius: PASTE_BAR.radius,
            padding: PASTE_BAR.inset,
            gap: SPACE.xs,
            flexDirection: "row",
            alignItems: "center",
            alignSelf: fill ? "stretch" : undefined,
            backgroundColor: card,
            borderWidth: 1,
            borderColor: separator,
          },
        ]}
      >
        {children}
      </View>
    </Animated.View>
  );
}
