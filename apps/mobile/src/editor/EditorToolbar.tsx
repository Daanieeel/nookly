import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconHighlight,
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconItalic,
  IconKeyboard,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconQuote,
  IconStrikethrough,
} from "@tabler/icons-react-native";
import type { ComponentType } from "react";
import { ScrollView, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { TOOLBAR, type ToolbarId } from "./toolbar.ts";
import { useToolbar } from "./toolbar-store.ts";
import { CONTROL_SIZE, gapBetween } from "../ui/touch.ts";

const ICONS = {
  bold: IconBold,
  italic: IconItalic,
  strike: IconStrikethrough,
  code: IconCode,
  highlight: IconHighlight,
  h1: IconH1,
  h2: IconH2,
  bullets: IconList,
  numbers: IconListNumbers,
  tasks: IconListCheck,
  quote: IconQuote,
  outdent: IconArrowBarToLeft,
  indent: IconArrowBarToRight,
  undo: IconArrowBackUp,
  redo: IconArrowForwardUp,
} satisfies Record<ToolbarId, ComponentType<{ size?: number; color?: string }>>;

/// How tall the toolbar is: a 44 point button and its padding.
export const TOOLBAR_HEIGHT = 57;

/// Formatting for the page being typed in, riding on top of the keyboard. It lives over the
/// whole window, not in the page, so the page's own frame (the inset card, the drawer) can
/// never leave it under the keyboard. It shows only while an editor has the keyboard.
export function EditorToolbar() {
  const theme = useTheme();
  const { focused, on, run } = useToolbar();
  const keyboard = useAnimatedKeyboard();
  const ride = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));
  if (!focused || !run) return null;
  return (
    <Animated.View
      className="flex-row border-t border-border bg-background"
      accessibilityRole="toolbar"
      style={[{ position: "absolute", left: 0, right: 0, bottom: 0 }, ride]}
    >
      <ScrollView
        className="flex-1"
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
      >
        <View className="flex-row px-2 py-1.5" style={{ gap: gapBetween(CONTROL_SIZE.icon) }}>
          {TOOLBAR.map(({ id, label }) => {
            const Icon = ICONS[id];
            return (
              <View key={id} className={cn("rounded-lg", on[id] && "bg-primary/15")}>
                <IconButton
                  label={label}
                  icon={
                    <Icon
                      size={22}
                      color={on[id] ? theme.colors.primary : theme.colors.foreground}
                    />
                  }
                  onPress={() => run(id)}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View className="justify-center border-l border-border px-1">
        <IconButton
          label="Hide Keyboard"
          icon={<IconKeyboard size={22} color={theme.colors.foreground} />}
          onPress={() => run("done")}
        />
      </View>
    </Animated.View>
  );
}
