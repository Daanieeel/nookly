import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { SPLIT_MIN_GROUP } from "../ui/pane.tsx";
import { MIN_TOUCH } from "../ui/touch.ts";
import { workspace } from "./workspace-store.ts";

/// Where the two groups split, as a share of `area`, kept so each group has the desktop's
/// minimum.
export function ratioAt(x: number, area: number): number {
  const min = SPLIT_MIN_GROUP / area;
  return Math.min(1 - min, Math.max(min, x / area));
}

/// The desktop's split divider at touch size (1.5): a finger wide strip over the gap
/// between the groups. A drag shows where the split lands and moves it there on release;
/// a double tap splits evenly again. `left` is where the gap's middle is in the page area.
export function SplitDivider({ left, area }: { left: number; area: number }) {
  const offset = useSharedValue(0);
  const dragging = useSharedValue(0);
  const save = (x: number) => workspace.setRatio(ratioAt(x, area));
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onBegin(() => {
      dragging.value = 1;
    })
    .onUpdate((event) => {
      const x = Math.min(
        area - SPLIT_MIN_GROUP,
        Math.max(SPLIT_MIN_GROUP, left + event.translationX),
      );
      offset.value = x - left;
    })
    .onEnd(() => {
      runOnJS(save)(left + offset.value);
    })
    .onFinalize(() => {
      dragging.value = 0;
      offset.value = 0;
    });
  const even = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => runOnJS(save)(area / 2));
  const guide = useAnimatedStyle(() => ({
    opacity: dragging.value,
    transform: [{ translateX: offset.value }],
  }));
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, even)}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Split Divider"
        accessibilityHint="Drag to resize, double tap to split evenly"
        accessibilityActions={[
          { name: "increment", label: "Wider Left Group" },
          { name: "decrement", label: "Narrower Left Group" },
        ]}
        onAccessibilityAction={(event) =>
          save(left + (event.nativeEvent.actionName === "increment" ? 40 : -40))
        }
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: left - MIN_TOUCH / 2,
          width: MIN_TOUCH,
          alignItems: "center",
        }}
      >
        <Animated.View style={guide} className="h-full w-0.5 bg-primary" />
      </View>
    </GestureDetector>
  );
}
