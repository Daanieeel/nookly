import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconHighlight,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconQuote,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react-native";
import type { ComponentType } from "react";
import { ScrollView, View } from "react-native";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { TOOLBAR, type ToolbarId } from "./toolbar.ts";
import { useToolbar } from "./toolbar-store.ts";

const ICONS = {
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  strike: IconStrikethrough,
  code: IconCode,
  highlight: IconHighlight,
  h1: IconH1,
  h2: IconH2,
  bullets: IconList,
  numbers: IconListNumbers,
  tasks: IconListCheck,
  quote: IconQuote,
  outdent: IconIndentDecrease,
  indent: IconIndentIncrease,
  undo: IconArrowBackUp,
  redo: IconArrowForwardUp,
} satisfies Record<ToolbarId, ComponentType<{ size?: number; color?: string }>>;

/// Formatting for the page being typed in, in a row above the keyboard. It shows only
/// while an editor has the keyboard.
export function EditorToolbar() {
  const theme = useTheme();
  const { focused, on, run } = useToolbar();
  if (!focused || !run) return null;
  return (
    <View className="border-t border-border bg-background" accessibilityRole="toolbar">
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
      >
        <View className="flex-row gap-0.5 px-2 py-1.5">
          {TOOLBAR.map(({ id, label }) => {
            const Icon = ICONS[id];
            return (
              <View key={id} className={cn("rounded-lg", on[id] && "bg-primary/15")}>
                <IconButton
                  label={label}
                  icon={
                    <Icon
                      size={20}
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
    </View>
  );
}
