import { IconArrowUp, IconLink } from "@tabler/icons-react-native";
import { useContext, useState } from "react";
import { TextInput } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useRaised, useScheme, useSemantic } from "./kit/scheme.ts";
import { lineInput } from "./kit/line-input.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { IconButton } from "./Button.tsx";
import { CORNER, PRIMARY, RADIUS, SPACE, elevation, focusDepth } from "./tokens.ts";

/// How far the bar sits from the screen's sides.
export const PASTE_BAR_MARGIN = 12;

/// Room a page leaves under its last item for the bar floating over it, and the bar's own
/// height with the gap above it, for what stacks over it (the save bar).
export const PASTE_BAR_ROOM = 120;
export const PASTE_BAR_STACK = 58;

/// The bar's shape: its button sits `inset` in from every edge, inside the bar's 1 point edge,
/// and the bar's corners are the button's plus that distance, so the two curves run alongside.
const BAR_EDGE = 1;
const BAR_INSET = 2;
export const PASTE_BAR = {
  inset: BAR_INSET,
  edge: BAR_EDGE,
  height: 44 + 2 * (BAR_INSET + BAR_EDGE),
  radius: RADIUS.control + BAR_INSET + BAR_EDGE,
};

/// How far a floating bar sits above the screen's bottom: clear of the home indicator.
export function usePasteBarLift() {
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return Math.max(bottom, PASTE_BAR_MARGIN) + SPACE.xs;
}

/// A link pasted into a bar floating at the bottom of a page (Bookmarks, Files): a pill snug in
/// the screen's own corners. The keyboard lifts it, its shadow deepening while it is typed in
/// so it stands out over the page.
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
  const raised = useRaised();
  const edge = useSemantic("controlEdge");
  const scheme = useScheme();
  const lift = usePasteBarLift();
  const keyboard = useAnimatedKeyboard();
  const [focused, setFocused] = useState(false);
  const bar = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: -Math.max(0, keyboard.height.value - lift + SPACE.sm) }],
    };
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
          bottom: lift,
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
        className="flex-row items-center gap-2 pl-4"
        style={[
          CORNER,
          focused ? focusDepth(PRIMARY, scheme) : elevation("popover", scheme),
          {
            backgroundColor: raised,
            borderWidth: 1,
            borderColor: edge,
            height: PASTE_BAR.height,
            paddingRight: PASTE_BAR.inset,
            borderRadius: PASTE_BAR.radius,
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
          style={[lineInput("callout"), { minHeight: 44, flex: 1, color: theme.colors.foreground }]}
        />
        <IconButton
          label={sendLabel}
          variant="default"
          disabled={!ready}
          onPress={onSubmit}
          icon={<IconArrowUp size={22} color={theme.colors.primaryForeground} />}
        />
      </Animated.View>
    </Animated.View>
  );
}
