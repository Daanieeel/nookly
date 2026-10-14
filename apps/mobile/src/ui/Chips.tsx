import { buttonVariants } from "@nookly/ui/classes";
import { Pressable, ScrollView, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { Text } from "./Text.tsx";

/// One choice of a few: a status, a Space, a label. A small desktop `Button`, `default`
/// when chosen and `secondary` when not.
export function Chip({
  label,
  selected,
  onPress,
  icon,
  multiple = false,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  /// One of several that can be on at once (labels), rather than one of a set.
  multiple?: boolean;
  disabled?: boolean;
}) {
  const { box, text } = splitText(
    row(buttonVariants({ variant: selected ? "default" : "secondary", size: "sm" })),
  );
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(box, "active:opacity-80")}
    >
      {icon}
      <Text className={text}>{label}</Text>
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
  const role = multiple ? undefined : "radiogroup";
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole={role}
        accessibilityLabel={label}
        contentContainerClassName="gap-2"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View accessibilityRole={role} accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {children}
    </View>
  );
}
