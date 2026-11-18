import type { Icon } from "@tabler/icons-react-native";
import { type ReactNode, useCallback, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { type HapticName, haptic } from "./haptics.ts";
import { Label } from "./kit/Label.tsx";
import { useScheme } from "./kit/scheme.ts";
import { FADE, SPRING, SWIPE, settleSwipe, swipeDrag } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { AtEdgeProvider, useGutter } from "./row-edge.tsx";
import { useTheme } from "./theme.ts";
import { TINT } from "./tokens.ts";

/// What an action's colour says, as Mail's: finishing or bringing back is positive (green),
/// removing destructive (red), marking warning (orange, Mail's flag), a type's own action
/// accent (blue) and more choices neutral (grey).
export type SwipeTone = "positive" | "destructive" | "warning" | "accent" | "neutral";

export interface SwipeAction {
  label: string;
  /// The desktop's icon for the action (a check for Done, a bin for Trash).
  icon?: Icon;
  tone: SwipeTone;
  /// What the finger feels as it acts: a tap unless the action names its own.
  haptic?: HapticName;
  onPress: () => void;
}

const ORANGE = { light: "#c75000", dark: "#ff9f0a" } as const;

function useTint(tone: SwipeTone): string {
  const theme = useTheme();
  const scheme = useScheme();
  switch (tone) {
    case "positive":
      return theme.colors.positive;
    case "destructive":
      return theme.colors.destructive;
    case "warning":
      return ORANGE[scheme];
    case "accent":
      return TINT.blue[scheme];
    default:
      return TINT.gray[scheme];
  }
}

/// A row with swipe actions, as iOS Mail's. A swipe right uncovers `leading` from the left
/// edge, a swipe left `trailing` from the right edge, each side's actions side by side in
/// the order given (so `trailing` ends in Trash, the rightmost). The row follows the finger
/// and the buttons share what it uncovers; let go past half of them and they rest open,
/// pulled past most of the row and the outermost action (the first leading, the last
/// trailing) grows over the others and runs at once, the finger feeling the point where it
/// would. A touch stops the row where it is. Every action is also offered to screen
/// readers, so nothing needs a swipe.
export function SwipeRow({
  children,
  leading = [],
  trailing = [],
}: {
  children: ReactNode;
  leading?: SwipeAction[];
  trailing?: SwipeAction[];
}) {
  const gutter = useGutter();
  const still = useReduceMotion();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  // How far the outermost action has grown over the others: 0 side by side, 1 alone.
  const grown = useSharedValue(0);
  const [open, setOpen] = useState(false);
  // The actions are built once a swipe starts: a list need not build every row's hidden
  // buttons (a third of a row's views) for a swipe that may never come.
  const [revealed, setRevealed] = useState(false);
  const leadingCount = leading.length;
  const trailingCount = trailing.length;

  const run = useCallback((a: SwipeAction) => {
    haptic(a.haptic ?? "tap");
    a.onPress();
  }, []);
  const runOuter = useCallback(
    (side: number) => {
      const a = side > 0 ? leading[0] : trailing.at(-1);
      if (a) run(a);
    },
    [leading, trailing, run],
  );
  const feelEdge = useCallback(() => haptic("edge"), []);

  const settle = (to: number, velocity = 0) => {
    "worklet";
    x.value = still
      ? withTiming(to, { duration: FADE.in })
      : withSpring(to, { ...SPRING.swipe, velocity });
  };
  const grow = (to: number) => {
    "worklet";
    grown.value = still ? withTiming(to, { duration: FADE.in }) : withSpring(to, SPRING.swipe);
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
        left: leadingCount > 0,
        right: trailingCount > 0,
        width: width.value,
      })(event.translationX);
      x.value = next;
      const past = Math.abs(next) >= width.value * SWIPE.full;
      if (past !== armed.value) {
        armed.value = past;
        grow(past ? 1 : 0);
        runOnJS(feelEdge)();
      }
    })
    .onEnd((event) => {
      armed.value = false;
      const side = Math.sign(x.value);
      const count = side > 0 ? leadingCount : trailingCount;
      const settled = settleSwipe({
        offset: x.value,
        velocity: event.velocityX,
        width: width.value,
        rest: count * SWIPE.button,
      });
      if (count === 0 || settled.to === "closed") {
        settle(0, event.velocityX);
        grow(0);
        runOnJS(setOpen)(false);
      } else if (settled.to === "open") {
        settle(side * count * SWIPE.button, event.velocityX);
        grow(0);
        runOnJS(setOpen)(true);
      } else {
        // Acts at once; the row comes back to show what changed (a finished task), or
        // leaves with the list's own motion (an item moved to Trash).
        runOnJS(runOuter)(side);
        settle(0, event.velocityX);
        grow(0);
        runOnJS(setOpen)(false);
      }
    });

  const onLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const actions = [...leading, ...trailing];
  return (
    <GestureDetector gesture={pan}>
      <View
        testID="swipe-row"
        onLayout={onLayout}
        style={{ marginHorizontal: gutter === 0 ? 0 : -gutter, overflow: "hidden" }}
      >
        {revealed && leadingCount > 0 ? (
          <Side x={x} grown={grown} side="leading" actions={leading} close={close} run={run} />
        ) : null}
        {revealed && trailingCount > 0 ? (
          <Side x={x} grown={grown} side="trailing" actions={trailing} close={close} run={run} />
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

/// One side's actions in what the row uncovers, filled with the outermost one's colour so
/// a pull past the buttons stays that colour.
function Side({
  x,
  grown,
  side,
  actions,
  close,
  run,
}: {
  x: SharedValue<number>;
  grown: SharedValue<number>;
  side: "leading" | "trailing";
  actions: SwipeAction[];
  close: () => void;
  run: (a: SwipeAction) => void;
}) {
  const leading = side === "leading";
  const outer = leading ? 0 : actions.length - 1;
  const fill = useTint(actions[outer].tone);
  const uncovered = useAnimatedStyle(() => ({
    width: Math.max(0, leading ? x.value : -x.value),
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          flexDirection: "row",
          backgroundColor: fill,
          overflow: "hidden",
        },
        leading ? { left: 0 } : { right: 0 },
        uncovered,
      ]}
    >
      {actions.map((action, index) => (
        <ActionButton
          key={action.label}
          action={action}
          x={x}
          grown={grown}
          share={{ index, count: actions.length, outer: index === outer, leading }}
          onPress={() => {
            close();
            run(action);
          }}
        />
      ))}
    </Animated.View>
  );
}

/// An action's button: its share of what is uncovered, or all of it once the outermost one
/// has grown over the rest. Its icon and name keep to the side touching the row.
function ActionButton({
  action,
  x,
  grown,
  share,
  onPress,
}: {
  action: SwipeAction;
  x: SharedValue<number>;
  grown: SharedValue<number>;
  share: { index: number; count: number; outer: boolean; leading: boolean };
  onPress: () => void;
}) {
  const tint = useTint(action.tone);
  const { count, outer, leading } = share;
  const sized = useAnimatedStyle(() => {
    const all = Math.abs(x.value);
    const even = all / count;
    return { width: outer ? even + (all - even) * grown.value : even * (1 - grown.value) };
  });
  const ActionIcon = action.icon;
  return (
    <Animated.View style={[{ backgroundColor: tint, overflow: "hidden" }, sized]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          justifyContent: leading ? "flex-end" : "flex-start",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: SWIPE.button,
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            paddingHorizontal: 4,
          }}
        >
          {ActionIcon ? <ActionIcon size={22} color="#ffffff" /> : null}
          <Label type="footnote" weight="600" tint="#ffffff" numberOfLines={1}>
            {action.label}
          </Label>
        </View>
      </Pressable>
    </Animated.View>
  );
}
