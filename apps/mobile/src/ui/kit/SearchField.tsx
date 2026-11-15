import { IconSearch, IconX } from "@tabler/icons-react-native";
import { useEffect, useState } from "react";
import { type ColorValue, Pressable, TextInput, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { FADE, SPRING } from "../motion.ts";
import { useReduceMotion } from "../reduce-motion.ts";
import { CORNER, FACE, RADIUS, SPACE, TYPE } from "../tokens.ts";
import { MIN_TOUCH, touchSlop } from "../touch.ts";
import { Glyph } from "./Glyph.tsx";
import { useSemantic, useSemanticPair } from "./scheme.ts";

/// Roomier than a finger: the bar people type into first on a page.
export const SEARCH_HEIGHT = 50;
const HEIGHT = SEARCH_HEIGHT;

/// Linear's search field: a filled squircle with a magnifier. Once something is typed, a full
/// X button grows out of it to its right, in the same fill, to clear it: the small x inside
/// the field was too hard to hit. Sits pinned above the list it searches.
export function SearchField({
  label,
  value,
  onChangeText,
  placeholder = "Search",
  onSubmit,
  autoFocus,
}: {
  /// Read out: "Search Status".
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const fill = useSemantic("fill");
  // Solid, never see through: a translucent grey shows the magnifier's circle through its
  // handle where the two strokes cross.
  const muted = useSemanticPair("secondaryLabelSolid");
  const text = useSemantic("label");
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View
        testID="search-field"
        style={[
          CORNER,
          {
            minHeight: HEIGHT,
            borderRadius: RADIUS.control,
            backgroundColor: fill,
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: SPACE.md,
            paddingRight: SPACE.md,
            gap: SPACE.sm,
            flex: 1,
          },
        ]}
      >
        <IconSearch testID="search-icon" size={20} color={muted.hex} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={muted.color}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
          returnKeyType={onSubmit ? "done" : "search"}
          onSubmitEditing={onSubmit}
          clearButtonMode="never"
          hitSlop={touchSlop(HEIGHT, MIN_TOUCH)}
          maxFontSizeMultiplier={2}
          style={{
            flex: 1,
            minHeight: HEIGHT,
            paddingVertical: 0,
            fontFamily: FACE["400"],
            fontSize: TYPE.body.fontSize,
            color: text,
          }}
        />
      </View>
      <ClearButton
        shown={value.length > 0}
        fill={fill}
        color={muted.hex}
        onClear={() => onChangeText("")}
      />
    </View>
  );
}

/// The X beside the field: it grows out of the field's right edge as text comes in (the
/// field giving way to it), and shrinks back into it once the field is empty.
function ClearButton({
  shown,
  fill,
  color,
  onClear,
}: {
  shown: boolean;
  fill: ColorValue;
  color: string;
  onClear: () => void;
}) {
  const still = useReduceMotion();
  const open = useSharedValue(shown ? 1 : 0);
  // Still drawn while it shrinks away, so it goes the way it came.
  const [present, setPresent] = useState(shown);
  useEffect(() => {
    if (shown) setPresent(true);
    const done = (finished?: boolean) => {
      "worklet";
      if (finished && !shown) runOnJS(setPresent)(false);
    };
    open.value = still
      ? withTiming(shown ? 1 : 0, { duration: shown ? FADE.in : FADE.out }, done)
      : withSpring(shown ? 1 : 0, SPRING.menu, done);
  }, [shown, still, open]);
  const grow = useAnimatedStyle(() => ({
    width: (HEIGHT + SPACE.sm) * open.value,
    opacity: still ? open.value : Math.min(1, open.value * 1.5),
    transform: [{ scale: still ? 1 : 0.6 + 0.4 * open.value }],
  }));
  if (!present) return null;
  return (
    <Animated.View style={[{ height: HEIGHT, overflow: "hidden", alignItems: "flex-end" }, grow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear Search"
        accessibilityElementsHidden={!shown}
        disabled={!shown}
        onPress={onClear}
        style={({ pressed }) => [
          CORNER,
          {
            width: HEIGHT,
            height: HEIGHT,
            borderRadius: RADIUS.control,
            backgroundColor: fill,
            alignItems: "center",
            justifyContent: "center",
          },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Glyph icon={IconX} size={20} color={color} />
      </Pressable>
    </Animated.View>
  );
}
