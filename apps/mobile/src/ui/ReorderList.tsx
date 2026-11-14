import { IconGripVertical } from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { haptic } from "./haptics.ts";
import { useSemanticPair } from "./kit/scheme.ts";
import { LIFT_DELAY, LIFT_SCALE, SPRING } from "./motion.ts";
import { moveItem, shiftFor, slotAt } from "./reorder.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { MIN_TOUCH } from "./touch.ts";

/// Moves for a screen reader, which cannot drag.
const ACTIONS = {
  vertical: [
    { name: "moveUp", label: "Move Up" },
    { name: "moveDown", label: "Move Down" },
  ],
  horizontal: [
    { name: "moveLeft", label: "Move Left" },
    { name: "moveRight", label: "Move Right" },
  ],
};

interface Shared {
  active: { value: number };
  offset: { value: number };
  hover: { value: number };
}

function Item({
  index,
  count,
  size,
  horizontal,
  label,
  handle,
  shared,
  onDrop,
  children,
}: {
  index: number;
  count: number;
  size: number;
  horizontal: boolean;
  label: string;
  handle: boolean;
  shared: Shared;
  onDrop: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const muted = useSemanticPair("tertiaryLabel");
  const { active, offset, hover } = shared;
  const drag = (gesture: ReturnType<typeof Gesture.Pan>) =>
    gesture
      .onStart(() => {
        "worklet";
        active.value = index;
        offset.value = 0;
        hover.value = index;
        runOnJS(haptic)("select");
      })
      .onUpdate((event) => {
        "worklet";
        offset.value = horizontal ? event.translationX : event.translationY;
        const slot = slotAt(index, offset.value, size, count);
        if (slot !== hover.value) {
          hover.value = slot;
          runOnJS(haptic)("open");
        }
      })
      .onEnd(() => {
        "worklet";
        const to = slotAt(index, offset.value, size, count);
        // The row settles into its slot; the list then takes its new order.
        offset.value = withSpring((to - index) * size, SPRING.lift, () => {
          runOnJS(onDrop)(index, to);
        });
      })
      .onFinalize(() => {
        "worklet";
        if (active.value === index && offset.value === 0) active.value = -1;
      });
  // Anywhere on the row after a rest, as iOS lifts a row; at once on the grip.
  const row = drag(Gesture.Pan().activateAfterLongPress(LIFT_DELAY));
  const grip = drag(Gesture.Pan().minDistance(1));
  const style = useAnimatedStyle(() => {
    const lifted = active.value === index;
    const move = lifted
      ? offset.value
      : active.value < 0
        ? 0
        : reduce
          ? shiftFor(index, active.value, hover.value, size)
          : withSpring(shiftFor(index, active.value, hover.value, size), SPRING.lift);
    return {
      zIndex: lifted ? 10 : 0,
      transform: [
        horizontal ? { translateX: move } : { translateY: move },
        {
          scale:
            lifted && !reduce ? withSpring(LIFT_SCALE, SPRING.lift) : withSpring(1, SPRING.lift),
        },
      ],
      shadowOpacity: lifted ? 0.18 : 0,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    };
  });
  const actions = horizontal ? ACTIONS.horizontal : ACTIONS.vertical;
  return (
    <GestureDetector gesture={row}>
      <Animated.View
        accessible
        accessibilityLabel={`${label}, drag to reorder`}
        accessibilityActions={actions}
        onAccessibilityAction={(event) => {
          const back = event.nativeEvent.actionName === actions[0].name;
          const to = back ? index - 1 : index + 1;
          if (to >= 0 && to < count) onDrop(index, to);
        }}
        style={[
          { flexDirection: horizontal ? "column" : "row", alignItems: "center" },
          horizontal ? { width: size, height: size } : { minHeight: size },
          style,
        ]}
      >
        <View style={{ flex: 1, alignSelf: "stretch" }}>{children}</View>
        {handle ? (
          <GestureDetector gesture={grip}>
            <View
              style={{
                width: MIN_TOUCH,
                height: MIN_TOUCH,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconGripVertical size={20} color={muted.hex} />
            </View>
          </GestureDetector>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

/// A list whose rows (or, `horizontal`, icons) are put in order by dragging: a rest on a
/// row lifts it, or a touch on its grip, and the others step aside as it moves, as in
/// iOS's own lists. Every item has the same `size` along the list. A screen reader moves
/// them with its actions instead.
export function ReorderList<T>({
  items,
  keyOf,
  labelOf,
  size,
  horizontal = false,
  handle = !horizontal,
  onReorder,
  renderItem,
}: {
  items: T[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  size: number;
  horizontal?: boolean;
  /// A grip at the row's end that drags at once.
  handle?: boolean;
  onReorder: (keys: string[]) => void;
  renderItem: (item: T) => ReactNode;
}) {
  const active = useSharedValue(-1);
  const offset = useSharedValue(0);
  const hover = useSharedValue(-1);
  const keys = items.map(keyOf);
  const drop = (from: number, to: number) => {
    active.value = -1;
    offset.value = 0;
    hover.value = -1;
    if (from === to) return;
    haptic("select");
    onReorder(moveItem(keys, from, to));
  };
  return (
    <View style={{ flexDirection: horizontal ? "row" : "column" }}>
      {items.map((item, index) => (
        <Item
          key={keyOf(item)}
          index={index}
          count={items.length}
          size={size}
          horizontal={horizontal}
          label={labelOf(item)}
          handle={handle}
          shared={{ active, offset, hover }}
          onDrop={drop}
        >
          {renderItem(item)}
        </Item>
      ))}
    </View>
  );
}
