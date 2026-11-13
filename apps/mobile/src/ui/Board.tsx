import { type ReactNode, useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { edgeScroll, targetColumn } from "./board.ts";
import { Button } from "./Button.tsx";
import { haptic } from "./haptics.ts";
import { useSemantic } from "./kit/scheme.ts";
import { LIFT_DELAY, LIFT_SCALE, SPRING, WOBBLE, wobbleDelay } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { Text } from "./Text.tsx";
import { RADIUS, SPACE } from "./tokens.ts";

/// A column's width, as the desktop's board keeps every column the same.
export const COLUMN_WIDTH = 288;
const GAP = SPACE.md;
const PITCH = COLUMN_WIDTH + GAP;

export interface BoardColumn<T> {
  id: string;
  title: string;
  icon?: ReactNode;
  items: T[];
  /// Under the cards: a way to add one here.
  footer?: ReactNode;
}

interface Shared {
  scrollX: SharedValue<number>;
  startScroll: SharedValue<number>;
  nudge: (x: number) => void;
}

function Card({
  index,
  column,
  count,
  label,
  actions,
  wobbling,
  movable,
  shared,
  onOpen,
  onLift,
  onDrop,
  onAction,
  children,
}: {
  index: number;
  column: number;
  count: number;
  label: string;
  actions: { name: string; label: string }[];
  wobbling: boolean;
  movable: boolean;
  shared: Shared;
  onOpen: () => void;
  onLift: (column: number) => void;
  onDrop: (to: number) => void;
  onAction: (name: string) => void;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const surface = useSemantic("surface");
  const separator = useSemantic("separator");
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lifted = useSharedValue(false);
  const tilt = useSharedValue(0);
  const { scrollX, startScroll, nudge } = shared;

  useEffect(() => {
    if (wobbling && !reduce) {
      tilt.value = withDelay(
        wobbleDelay(index),
        withRepeat(
          withSequence(
            withTiming(WOBBLE.angle, { duration: WOBBLE.half }),
            withTiming(-WOBBLE.angle, { duration: WOBBLE.half }),
          ),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(tilt);
      tilt.value = withSpring(0, SPRING.press);
    }
  }, [wobbling, reduce, index, tilt]);

  // A rest lifts a card and starts the wobble; once the cards wobble, any one moves at once.
  const pan = (
    wobbling ? Gesture.Pan().minDistance(4) : Gesture.Pan().activateAfterLongPress(LIFT_DELAY)
  )
    .enabled(movable)
    .onStart(() => {
      "worklet";
      lifted.value = true;
      startScroll.value = scrollX.value;
      runOnJS(onLift)(column);
    })
    .onUpdate((event) => {
      "worklet";
      tx.value = event.translationX;
      ty.value = event.translationY;
      nudge(event.absoluteX);
    })
    .onEnd((event) => {
      "worklet";
      const scrolled = scrollX.value - startScroll.value;
      const to = targetColumn(column, event.translationX, scrolled, PITCH, count);
      if (to === column) {
        tx.value = withSpring(0, { ...SPRING.lift, velocity: event.velocityX });
        ty.value = withSpring(0, { ...SPRING.lift, velocity: event.velocityY });
      }
      runOnJS(onDrop)(to);
    })
    .onFinalize(() => {
      "worklet";
      lifted.value = false;
      startScroll.value = scrollX.value;
    });

  const style = useAnimatedStyle(() => {
    const up = lifted.value;
    // A held card stays under the finger while the board scrolls beneath it.
    const follow = up ? scrollX.value - startScroll.value : 0;
    return {
      zIndex: up ? 10 : 0,
      transform: [
        { translateX: tx.value + follow },
        { translateY: ty.value },
        { rotate: `${up ? 0 : tilt.value}deg` },
        { scale: withSpring(up && !reduce ? LIFT_SCALE : 1, SPRING.lift) },
      ],
      shadowOpacity: up ? 0.22 : 0.06,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            borderRadius: RADIUS.section,
            borderCurve: "continuous",
            backgroundColor: surface,
            borderWidth: 0.5,
            borderColor: separator,
            shadowColor: "#000",
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          },
          style,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={movable ? `${label}, card, drag to move` : `${label}, card`}
          accessibilityActions={actions}
          onAccessibilityAction={(event) => onAction(event.nativeEvent.actionName)}
          onPress={onOpen}
          // A rest that lifts the card is not a tap.
          onLongPress={() => {}}
          delayLongPress={LIFT_DELAY}
          style={{ padding: SPACE.md, gap: SPACE.sm }}
          className="active:opacity-70"
        >
          {children}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

/// Items as cards in columns of one width, as the desktop's board. With `onMove`, a rest on a
/// card sets every card wobbling, as icons do on the Home Screen, and lifts that one: it then
/// follows the finger into another column, the board scrolling along as it nears an edge. Done
/// ends the wobble. A screen reader moves a card with its actions.
export function Board<T>({
  columns,
  keyOf,
  labelOf,
  renderCard,
  onOpen,
  onMove,
}: {
  columns: BoardColumn<T>[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onOpen: (item: T) => void;
  onMove?: (item: T, columnId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useScrollOffset(ref);
  const startScroll = useSharedValue(0);
  const [wobbling, setWobbling] = useState(false);
  const [liftedColumn, setLiftedColumn] = useState(-1);
  /// Near an edge, each move of a held card scrolls the board on a little.
  const nudge = (x: number) => {
    "worklet";
    const step = edgeScroll(x, width);
    if (step !== 0) scrollTo(ref, Math.max(0, scrollX.value + step), 0, false);
  };
  const shared = { scrollX, startScroll, nudge };

  const lift = (column: number) => {
    haptic("select");
    setWobbling(true);
    setLiftedColumn(column);
  };
  const settle = () => setLiftedColumn(-1);

  return (
    <View className="gap-3">
      {wobbling ? (
        <View className="flex-row items-center gap-3">
          <Text variant="small" tone="muted" className="flex-1">
            Drag a card to another column.
          </Text>
          <Button label="Done" size="sm" onPress={() => setWobbling(false)} />
        </View>
      ) : null}
      <Animated.ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: GAP, alignItems: "flex-start" }}
        // Lets a lifted card show past the board's top and bottom while it moves.
        style={{ overflow: "visible" }}
      >
        {columns.map((column, columnIndex) => (
          <View
            key={column.id}
            accessibilityLabel={`${column.title} column`}
            style={{
              width: COLUMN_WIDTH,
              gap: SPACE.sm,
              zIndex: liftedColumn === columnIndex ? 10 : 0,
            }}
          >
            <View className="flex-row items-center gap-2 px-1">
              {column.icon}
              <Text className="font-medium">{column.title}</Text>
              <Text tone="muted">{column.items.length}</Text>
            </View>
            {column.items.map((item, index) => {
              const others = columns.filter((c) => c.id !== column.id);
              const move = (to: string) => onMove?.(item, to);
              return (
                <Card
                  key={keyOf(item)}
                  index={index + columnIndex * 3}
                  column={columnIndex}
                  count={columns.length}
                  label={labelOf(item)}
                  actions={
                    onMove
                      ? others.map((c) => ({ name: `move-${c.id}`, label: `Move to ${c.title}` }))
                      : []
                  }
                  wobbling={wobbling}
                  movable={onMove !== undefined}
                  shared={shared}
                  onOpen={() => onOpen(item)}
                  onLift={lift}
                  onDrop={(to) => {
                    settle();
                    const target = columns[to];
                    if (target && target.id !== column.id) {
                      haptic("select");
                      move(target.id);
                    }
                  }}
                  onAction={(name) => {
                    const target = others.find((c) => `move-${c.id}` === name);
                    if (target) move(target.id);
                  }}
                >
                  {renderCard(item)}
                </Card>
              );
            })}
            {column.footer}
          </View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}
