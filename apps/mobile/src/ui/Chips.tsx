import { Pressable, ScrollView, View } from "react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// One choice of a few, as a pill: a status, a Space, a label. `color` tints it when
/// selected (a Space's or a label's own color), else the primary color does.
export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
  multiple = false,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  color?: string;
  /// One of several that can be on at once (labels), rather than one of a set.
  multiple?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const tint = color ?? theme.colors.primary;
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(1.5),
        minHeight: 36,
        paddingHorizontal: theme.space(3),
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: selected ? tint : theme.colors.input,
        backgroundColor: selected ? `${tint}1a` : theme.colors.secondary,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

/// Chips that wrap onto more lines, or scroll sideways in one line when there may be
/// many (Spaces, Courses).
export function ChipGroup({
  label,
  children,
  scroll = false,
  multiple = false,
}: {
  label: string;
  children: React.ReactNode;
  scroll?: boolean;
  multiple?: boolean;
}) {
  const theme = useTheme();
  const role = multiple ? undefined : "radiogroup";
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole={role}
        accessibilityLabel={label}
        contentContainerStyle={{ gap: theme.space(2) }}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View
      accessibilityRole={role}
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}
    >
      {children}
    </View>
  );
}
