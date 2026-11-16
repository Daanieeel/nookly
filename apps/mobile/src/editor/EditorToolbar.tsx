import { useIsTablet } from "../ui/pane.tsx";
import { useKeyboardTop } from "../ui/sheet/Floating.tsx";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconChevronDown,
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
import { CORNER, RADIUS } from "../ui/tokens.ts";
import { type EditorAction, type EditorState, TOOLBAR, type ToolbarId } from "./toolbar.ts";
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
/// `inline` draws it where it stands instead: in a sheet (a compose form), which sits over
/// the window's own toolbar and already rides on the keyboard.
export function EditorToolbar({ inline = false }: { inline?: boolean }) {
  const theme = useTheme();
  const { focused, on, off = {}, run } = useToolbar();
  const keyboard = useAnimatedKeyboard();
  const ride = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));
  // A tablet typed on with a hardware keyboard has no software keyboard up: the toolbar is
  // the desktop's format bar, floating over the bottom of the page (3.9).
  const tablet = useIsTablet();
  const softKeyboard = useKeyboardTop().height > 0;
  if (!focused || !run) return null;
  if (tablet && !inline && !softKeyboard) {
    return (
      <View pointerEvents="box-none" className="absolute bottom-4 left-0 right-0 items-center px-4">
        <View
          testID="format-bar"
          accessibilityRole="toolbar"
          className="max-w-full flex-row rounded-xl border border-border bg-popover px-1.5 py-1 shadow-lg"
        >
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
          >
            <View className="flex-row" style={{ gap: 2 }}>
              <ToolbarButtons iconSize={18} on={on} off={off} run={run} />
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }
  return (
    <Animated.View
      className={cn(
        "flex-row",
        inline ? "mx-4 mb-2 overflow-hidden bg-muted" : "border-t border-border bg-background",
      )}
      accessibilityRole="toolbar"
      style={
        inline
          ? [CORNER, { borderRadius: RADIUS.control }]
          : [{ position: "absolute", left: 0, right: 0, bottom: 0 }, ride]
      }
    >
      <ScrollView
        className="flex-1"
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
      >
        <View className="flex-row px-2 py-1.5" style={{ gap: gapBetween(CONTROL_SIZE.icon) }}>
          <ToolbarButtons iconSize={22} on={on} off={off} run={run} />
        </View>
      </ScrollView>
      <View className="justify-center border-l border-border px-1">
        <IconButton
          label="Hide Keyboard"
          icon={
            // A keyboard with a chevron under it: the keyboard goes down.
            <View style={{ width: 24, height: 26, alignItems: "center" }}>
              <IconKeyboard size={22} color={theme.colors.foreground} />
              <View style={{ position: "absolute", bottom: -4 }}>
                <IconChevronDown size={12} strokeWidth={3} color={theme.colors.foreground} />
              </View>
            </View>
          }
          onPress={() => run("done")}
        />
      </View>
    </Animated.View>
  );
}

/// The toolbar's buttons, the format on lit in the primary colour.
function ToolbarButtons({
  iconSize,
  on,
  off,
  run,
}: {
  iconSize: number;
  on: EditorState["on"];
  off: NonNullable<EditorState["off"]>;
  run: (id: EditorAction) => void;
}) {
  const theme = useTheme();
  return (
    <>
      {TOOLBAR.map(({ id, label }) => {
        const Icon = ICONS[id];
        return (
          <View key={id} className={cn("rounded-lg", on[id] && "bg-primary/15")}>
            <IconButton
              label={label}
              icon={
                <Icon
                  size={iconSize}
                  color={on[id] ? theme.colors.primary : theme.colors.foreground}
                />
              }
              disabled={off[id]}
              onPress={() => run(id)}
            />
          </View>
        );
      })}
    </>
  );
}
