import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconSelector } from "@tabler/icons-react-native";
import { Children, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn } from "./classes.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { TOUCH_ROW } from "./touch.ts";

/// An item's properties as one card of rows, like Linear's: each row a name and its value,
/// hairlines between them. Nothing floats on its own. A row that can change opens its
/// picker in a sheet.
export function PropertyList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0")}>
      {rows.map((row, index) => (
        <View
          // The rows are fixed in number and order.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          className={index > 0 ? "border-t border-border/60" : undefined}
        >
          {row}
        </View>
      ))}
    </View>
  );
}

/// One property: an icon, its name, its value on the right. With `onPress` it opens its
/// picker (a sheet).
export function Property({
  icon,
  label,
  value,
  valueIcon,
  disabled = false,
  onPress,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  /// Shown beside the value (a status's symbol).
  valueIcon?: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const interactive = Boolean(onPress) && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ disabled: !interactive }}
      disabled={!interactive}
      onPress={onPress}
      style={TOUCH_ROW}
      className="min-h-12 flex-row items-center gap-3 px-4 active:bg-accent/40"
    >
      {icon}
      <Text className="flex-1" numberOfLines={1}>
        {label}
      </Text>
      {valueIcon}
      <Text tone="muted" numberOfLines={1} style={{ maxWidth: "55%" }}>
        {value}
      </Text>
      {interactive ? <IconSelector size={16} color={theme.colors.mutedForeground} /> : null}
    </Pressable>
  );
}
