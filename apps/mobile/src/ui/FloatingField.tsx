import { IconArrowUp, IconLink } from "@tabler/icons-react-native";
import { TextInput, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { RoundButton } from "./sheet/Sheet.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { CORNER, DEPTH, RADIUS, SPACE } from "./tokens.ts";

export const PASTE_BAR_HEIGHT = 56;

/// How far the send button sits inside the bar, on its right and above and below it.
const PASTE_BAR_INSET = 6;

/// A squircle with the regular corners, not a pill: the send button's corners plus its inset,
/// so the two curves run side by side.
export const PASTE_BAR_RADIUS = RADIUS.control + PASTE_BAR_INSET;

/// A little higher above the bottom than it is from the sides, over the home indicator as
/// Safari's bar sits: right at the corners it looked too low.
export const PASTE_BAR_BOTTOM = SPACE.xl;

/// Room a page leaves under its last item for the bar floating over it.
export const PASTE_BAR_ROOM = 72;

/// A link pasted into a bar floating at the bottom of a page (Bookmarks, Files), as the
/// desktop's: it rides up with the keyboard and sends with the button at its end.
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
  const keyboard = useAnimatedKeyboard();
  const bottom = PASTE_BAR_BOTTOM;
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.value - bottom + SPACE.md) }],
  }));
  const ready = value.trim().length > 0;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", left: SPACE.md, right: SPACE.md, bottom }, lift]}
    >
      {error ? (
        <Text tone="destructive" variant="small" className="mb-1 px-2">
          {error}
        </Text>
      ) : null}
      <View
        testID="floating-field"
        className="flex-row items-center gap-2 border border-border bg-card pl-4"
        style={[
          CORNER,
          {
            minHeight: PASTE_BAR_HEIGHT,
            paddingRight: PASTE_BAR_INSET,
            borderRadius: PASTE_BAR_RADIUS,
            ...DEPTH.floating,
          },
        ]}
      >
        <IconLink size={18} color={theme.colors.mutedForeground} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={() => ready && onSubmit()}
          placeholder={label}
          placeholderTextColor={theme.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="send"
          className="h-11 flex-1 font-sans text-base text-foreground"
        />
        <RoundButton label={sendLabel} tone="primary" disabled={!ready} onPress={onSubmit}>
          <IconArrowUp
            size={22}
            color={ready ? theme.colors.primaryForeground : theme.colors.mutedForeground}
          />
        </RoundButton>
      </View>
    </Animated.View>
  );
}
