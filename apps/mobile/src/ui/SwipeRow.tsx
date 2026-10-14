import { Pressable, View } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { useRef } from "react";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

interface SwipeAction {
  label: string;
  color: string;
  onPress: () => void;
}

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
  const theme = useTheme();
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
        style={{
          width: 96,
          backgroundColor: a.color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="label" style={{ color: theme.colors.primaryForeground }}>
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
