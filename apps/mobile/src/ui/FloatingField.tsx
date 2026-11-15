import { IconArrowUp, IconLink } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, TextInput, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { FADE, SPRING } from "./motion.ts";
import { useSemantic } from "./kit/scheme.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { CORNER, DEPTH, SPACE } from "./tokens.ts";

/// How far the bar sits from the screen's sides and bottom, as Safari's does.
export const PASTE_BAR_MARGIN = 8;

/// Room a page leaves under its last item for the bar floating over it.
export const PASTE_BAR_ROOM = 84;

/// The rounded corners of iPhone screens, in points, by the screen's size: no API tells an
/// app, so these are the phones' own published shapes. A phone not listed (one with a
/// Home button and square corners, an iPad, one not out yet) gets 0, and the bar keeps its
/// regular corners.
const SCREEN_CORNERS: Record<string, number> = {
  "375x812": 39, // X, XS, 11 Pro (the 12 and 13 mini share the size, a little rounder)
  "414x896": 41.5, // XR, 11, XS Max, 11 Pro Max
  "360x780": 44, // 12 mini, 13 mini
  "390x844": 47.33, // 12, 12 Pro, 13, 13 Pro, 14
  "428x926": 53.33, // 12 Pro Max, 13 Pro Max, 14 Plus
  "393x852": 55, // 14 Pro, 15, 15 Pro, 16
  "430x932": 55, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  "402x874": 62, // 16 Pro, 17, 17 Pro
  "440x956": 62, // 16 Pro Max, 17 Pro Max
  "420x912": 62, // Air
};

export function screenCornerRadius({ width, height }: { width: number; height: number }) {
  const short = Math.round(Math.min(width, height));
  const long = Math.round(Math.max(width, height));
  return SCREEN_CORNERS[`${short}x${long}`] ?? 0;
}

/// The bar's shape for a screen whose corners are `screen` points round: its bottom corners
/// run alongside the screen's at the bar's margin, its top corners are the regular ones, and
/// the send button sits `inset` inside it with corners nested in the bar's.
export function floatingBarShape(screen: number) {
  const height = 68;
  const top = 16;
  const inset = 8;
  const bottom = screen > 0 ? Math.min(screen - PASTE_BAR_MARGIN, height - top) : top;
  return {
    height,
    top,
    bottom,
    button: { size: height - 2 * inset, inset, top: top - inset, bottom: bottom - inset },
  };
}

/// A link pasted into a bar floating at the bottom of a page (Bookmarks, Files). At rest it
/// sits snug in the screen's own corners; the keyboard lifts it away from them, its corners
/// relaxing to the regular ones and its shadow deepening so it stands out over the page.
export function FloatingField({
  label,
  value,
  onChangeText,
  onSubmit,
  sendLabel,
  error,
}: {
  /// Read out, and its placeholder: "Paste a URL to save it".
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  /// Read out for the send button: "Save Bookmark".
  sendLabel: string;
  error?: string | null;
}) {
  const theme = useTheme();
  const still = useReduceMotion();
  const fill = useSemantic("fill");
  const shape = floatingBarShape(screenCornerRadius(useWindowDimensions()));
  const keyboard = useAnimatedKeyboard();
  const [focused, setFocused] = useState(false);
  // 0 at rest in the corners, 1 once the keyboard has lifted it clear of them.
  const lifted = useDerivedValue(() => Math.min(1, keyboard.height.value / 80));
  const glow = useDerivedValue(() =>
    still
      ? withTiming(focused ? 1 : 0, { duration: FADE.in })
      : withSpring(focused ? 1 : 0, SPRING.menu),
  );
  const bar = useAnimatedStyle(() => {
    const bottom = interpolate(lifted.value, [0, 1], [shape.bottom, shape.top]);
    return {
      transform: [
        { translateY: -Math.max(0, keyboard.height.value - PASTE_BAR_MARGIN + SPACE.sm) },
      ],
      borderBottomLeftRadius: bottom,
      borderBottomRightRadius: bottom,
      shadowOpacity: interpolate(glow.value, [0, 1], [DEPTH.floating.shadowOpacity, 0.32]),
      shadowRadius: interpolate(glow.value, [0, 1], [DEPTH.floating.shadowRadius, 32]),
    };
  });
  const button = useAnimatedStyle(() => {
    const bottom = interpolate(lifted.value, [0, 1], [shape.button.bottom, shape.button.top]);
    return { borderBottomRightRadius: bottom };
  });
  const ready = value.trim().length > 0;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: PASTE_BAR_MARGIN,
          right: PASTE_BAR_MARGIN,
          bottom: PASTE_BAR_MARGIN,
        },
      ]}
    >
      {error ? (
        <Text tone="destructive" variant="small" className="mb-1 px-2">
          {error}
        </Text>
      ) : null}
      <Animated.View
        testID="floating-field"
        className="flex-row items-center gap-2 border border-border bg-card pl-4"
        style={[
          CORNER,
          DEPTH.floating,
          {
            height: shape.height,
            paddingRight: shape.button.inset,
            borderTopLeftRadius: shape.top,
            borderTopRightRadius: shape.top,
          },
          bar,
        ]}
      >
        <IconLink size={18} color={theme.colors.mutedForeground} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={() => ready && onSubmit()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={label}
          placeholderTextColor={theme.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="send"
          className="h-11 flex-1 font-sans text-base text-foreground"
        />
        <Animated.View
          style={[
            CORNER,
            {
              width: shape.button.size,
              height: shape.button.size,
              overflow: "hidden",
              borderTopLeftRadius: shape.button.top,
              borderTopRightRadius: shape.button.top,
              borderBottomLeftRadius: shape.button.top,
            },
            button,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={onSubmit}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: ready ? theme.colors.primary : fill,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View pointerEvents="none">
              <IconArrowUp
                size={22}
                color={ready ? theme.colors.primaryForeground : theme.colors.mutedForeground}
              />
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
