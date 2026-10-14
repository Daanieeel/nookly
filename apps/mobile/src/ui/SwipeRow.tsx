import { Pressable, View } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { useRef } from "react";
import { Text } from "./Text.tsx";
import { cn } from "./classes.ts";

interface SwipeAction {
  label: string;
  /// Finishing or bringing back is positive, removing destructive.
  tone: "positive" | "destructive";
  onPress: () => void;
}

const TONES = { positive: "bg-positive", destructive: "bg-destructive" } as const;

/// A row with swipe actions: one revealed from the left, one from the right. Each is
/// also offered to screen readers as a custom action, so nothing needs a swipe.
export function SwipeRow({
  children,
  left,
  right,
}: {
  children: React.ReactNode;
  left?: SwipeAction;
  right?: SwipeAction;
}) {
  const swipeable = useRef<Swipeable>(null);
  const close = () => swipeable.current?.close();
  const action = (a: SwipeAction | undefined, close: () => void) =>
    a ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a.label}
        onPress={() => {
          close();
          a.onPress();
        }}
        className={cn("w-24 items-center justify-center", TONES[a.tone])}
      >
        <Text variant="label" className="text-primary-foreground">
          {a.label}
        </Text>
      </Pressable>
    ) : null;
  const actions = [left, right].filter((a): a is SwipeAction => a !== undefined);
  return (
    <Swipeable
      ref={swipeable}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={left ? () => action(left, close) : undefined}
      renderRightActions={right ? () => action(right, close) : undefined}
    >
      <View
        accessible={false}
        accessibilityActions={actions.map((a) => ({ name: a.label, label: a.label }))}
        onAccessibilityAction={(event) =>
          actions.find((a) => a.label === event.nativeEvent.actionName)?.onPress()
        }
      >
        {children}
      </View>
    </Swipeable>
  );
}
