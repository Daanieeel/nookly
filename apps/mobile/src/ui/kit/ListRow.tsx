import { IconCheck, IconChevronRight } from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import {
  type AccessibilityRole,
  type AccessibilityState,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { MIN_TOUCH } from "../touch.ts";
import { GUTTER, SPACE, TINT } from "../tokens.ts";
import { Glyph } from "./Glyph.tsx";
import { Label } from "./Label.tsx";
import { useScheme, useSemantic, useSemanticPair } from "./scheme.ts";

/// The text size (a share of the default) from which a row's detail goes under its title.
const STACK_SCALE = 1.35;

/// A row of a list as iOS draws it: an icon badge, a title with a subtitle under it, a
/// value or detail on the right, and a check on the chosen one or a chevron where it
/// leads on. Full width and at least a finger tall; it darkens the moment a finger lands.
export function ListRow({
  badge,
  title,
  subtitle,
  detail,
  accessory = "none",
  destructive = false,
  disabled = false,
  onPress,
  accessibilityRole = "button",
  accessibilityLabel,
  selected,
}: {
  badge?: ReactNode;
  title: string;
  /// A line of detail under the title (the desktop's secondary text).
  subtitle?: string;
  /// Muted text on the right: a value, a date, a count, a key.
  detail?: string;
  accessory?: "none" | "check" | "chevron";
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  /// For a choice: whether it is the chosen one (the check shows when `accessory` is
  /// "check").
  selected?: boolean;
}) {
  const scheme = useScheme();
  const pressed = useSemantic("pressed");
  const muted = useSemanticPair("tertiaryLabel");
  const accent = TINT.blue[scheme];
  /// With large text a detail goes under the title, as iOS stacks a row's value.
  const stacked = useWindowDimensions().fontScale >= STACK_SCALE;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={
        accessibilityLabel ?? [title, subtitle, detail].filter(Boolean).join(", ")
      }
      accessibilityState={stateOf(disabled, selected)}
      disabled={disabled || !onPress}
      onPress={onPress}
      unstable_pressDelay={0}
      style={({ pressed: down }) => ({
        minHeight: subtitle ? 58 : MIN_TOUCH + 4,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: GUTTER,
        paddingVertical: SPACE.sm,
        backgroundColor: down ? pressed : undefined,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {badge}
      <View style={{ flex: 1, gap: 1 }}>
        <Label numberOfLines={2} tint={destructive ? TINT.red[scheme] : undefined}>
          {title}
        </Label>
        {subtitle ? (
          <Label type="subheadline" color="secondaryLabel" numberOfLines={2}>
            {subtitle}
          </Label>
        ) : null}
        {detail && stacked ? (
          <Label type="subheadline" color="secondaryLabel">
            {detail}
          </Label>
        ) : null}
      </View>
      {detail && !stacked ? (
        <Label color="secondaryLabel" numberOfLines={1} style={{ maxWidth: "45%" }}>
          {detail}
        </Label>
      ) : null}
      {accessory === "check" ? (
        <View style={{ width: 20, alignItems: "center" }}>
          {selected ? <Glyph icon={IconCheck} color={accent} /> : null}
        </View>
      ) : null}
      {accessory === "chevron" ? (
        <Glyph icon={IconChevronRight} size={14} color={muted.hex} />
      ) : null}
    </Pressable>
  );
}

/// What a screen reader hears of a row: a choice also says whether it is chosen.
function stateOf(disabled: boolean, selected: boolean | undefined): AccessibilityState {
  const state: AccessibilityState = { disabled };
  if (selected !== undefined) {
    state.checked = selected;
    state.selected = selected;
  }
  return state;
}
