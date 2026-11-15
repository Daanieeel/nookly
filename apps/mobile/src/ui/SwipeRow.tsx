import type { Icon } from "@tabler/icons-react-native";
import { type ReactNode, useCallback, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { type HapticName, haptic } from "./haptics.ts";
import { Label } from "./kit/Label.tsx";
import { FADE, SPRING, SWIPE, settleSwipe, swipeDrag } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { AtEdgeProvider, useGutter } from "./row-edge.tsx";
import { useTheme } from "./theme.ts";

interface SwipeAction {
  label: string;
  /// The desktop's icon for the action (a check for Done, a bin for Trash).
  icon?: Icon;
  /// Finishing or bringing back is positive, removing destructive.
  tone: "positive" | "destructive";
  /// What the finger feels as it acts: a tap unless the action names its own.
  haptic?: HapticName;
  onPress: () => void;
}

/// A row with swipe actions, as iOS Mail's: a swipe right reveals `left` from the screen's
/// left edge, a swipe left reveals `right` from the right edge. The row follows the finger
/// and the action's colour fills what it uncovers; let go past half the button and it
/// rests open on it, past most of the row and the action runs at once (the finger feels
/// the point where it would). A touch stops the row where it is. Each action is also
/// offered to screen readers, so nothing needs a swipe.
export function SwipeRow({
  children,
  left,
  right,
}: {
  children: ReactNode;
  left?: SwipeAction;
  right?: SwipeAction;
}) {
  const gutter = useGutter();
  const still = useReduceMotion();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const [open, setOpen] = useState(false);
  // The actions are built once a swipe starts: a list need not build every row's hidden
  // buttons (a third of a row's views) for a swipe that may never come.
  const [revealed, setRevealed] = useState(false);
  const hasLeft = left !== undefined;
  const hasRight = right !== undefined;

  const run = useCallback((a: SwipeAction) => {
    haptic(a.haptic ?? "tap");
    a.onPress();
  }, []);
  const runSide = useCallback(
    (side: number) => {
      const a = side > 0 ? left : right;
      if (a) run(a);
    },
    [left, right, run],
  );
  const feelEdge = useCallback(() => haptic("edge"), []);

  const settle = (to: number, velocity = 0) => {
    "worklet";
    x.value = still
      ? withTiming(to, { duration: FADE.in })
      : withSpring(to, { ...SPRING.swipe, velocity });
  };
  const close = () => {
    settle(0);
    setOpen(false);
  };

  const pan = Gesture.Pan()
    // Sideways only: a vertical drag still scrolls the list.
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .withTestId("swipe-row")
    .onStart(() => {
      runOnJS(setRevealed)(true);
    })
    .onBegin(() => {
      cancelAnimation(x);
      start.value = x.value;
    })
    .onUpdate((event) => {
      const next = swipeDrag({
        start: start.value,
        left: hasLeft,
        right: hasRight,
        width: width.value,
      })(event.translationX);
      x.value = next;
      const past = Math.abs(next) >= width.value * SWIPE.full;
      if (past !== armed.value) {
        armed.value = past;
        runOnJS(feelEdge)();
      }
    })
    .onEnd((event) => {
      armed.value = false;
      const side = Math.sign(x.value);
      const hasAction = side > 0 ? hasLeft : hasRight;
      const settled = settleSwipe({
        offset: x.value,
        velocity: event.velocityX,
        width: width.value,
      });
      if (!hasAction || settled.to === "closed") {
        settle(0, event.velocityX);
        runOnJS(setOpen)(false);
      } else if (settled.to === "open") {
        settle(side * SWIPE.button, event.velocityX);
        runOnJS(setOpen)(true);
      } else {
        // Acts at once; the row comes back to show what changed (a finished task), or
        // leaves with the list's own motion (a task moved to Trash).
        runOnJS(runSide)(side);
        settle(0, event.velocityX);
        runOnJS(setOpen)(false);
      }
    });

  const onLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leftFill = useAnimatedStyle(() => ({ width: Math.max(0, x.value) }));
  const rightFill = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));

  const actions = [left, right].filter((a): a is SwipeAction => a !== undefined);
  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={onLayout}
        style={{ marginHorizontal: gutter === 0 ? 0 : -gutter, overflow: "hidden" }}
      >
        {revealed && left ? (
          <Fill
            style={[leftFill, { left: 0 }]}
            action={left}
            align="end"
            onPress={close}
            run={run}
          />
        ) : null}
        {revealed && right ? (
          <Fill
            style={[rightFill, { right: 0 }]}
            action={right}
            align="start"
            onPress={close}
            run={run}
          />
        ) : null}
        <Animated.View
          style={row}
          accessible={false}
          accessibilityActions={actions.map((a) => ({ name: a.label, label: a.label }))}
          onAccessibilityAction={(event) => {
            const found = actions.find((a) => a.label === event.nativeEvent.actionName);
            if (found) run(found);
          }}
        >
          <AtEdgeProvider>{children}</AtEdgeProvider>
          {open ? (
            // A tap on an open row closes it, as in Mail, instead of opening the item.
            <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/// An action's colour filling what the row uncovers, its button against the row.
function Fill({
  style,
  action,
  align,
  onPress,
  run,
}: {
  style: object[];
  action: SwipeAction;
  /// Which end of the fill the button keeps to: the one touching the row.
  align: "start" | "end";
  onPress: () => void;
  run: (a: SwipeAction) => void;
}) {
  const theme = useTheme();
  const tint = action.tone === "positive" ? theme.colors.positive : theme.colors.destructive;
  const ActionIcon = action.icon;
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          backgroundColor: tint,
          overflow: "hidden",
          alignItems: align === "end" ? "flex-end" : "flex-start",
        },
        ...style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => {
          onPress();
          run(action);
        }}
        style={({ pressed }) => ({
          width: SWIPE.button,
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {ActionIcon ? <ActionIcon size={22} color="#ffffff" /> : null}
        <Label type="footnote" weight="600" tint="#ffffff" numberOfLines={1}>
          {action.label}
        </Label>
      </Pressable>
    </Animated.View>
  );
}
