import { IconSelector } from "@tabler/icons-react-native";
import { Children, cloneElement, isValidElement, type ReactNode, type RefObject } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { usePropertyLook } from "./parts.tsx";
import { CONTROL_SIZE, LIST_ROW, MIN_TOUCH, touchSlop } from "./touch.ts";

/// An item's properties as rows, like the desktop's details: each row a name and its value,
/// hairlines between them, flat on the page. A row that can change opens its picker.
export function PropertyList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  if (usePropertyLook() === "chip") {
    return <View className="flex-row flex-wrap gap-2">{rows}</View>;
  }
  return (
    <View>
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

/// A property at a glance: as tall as the desktop's property value (`h-7`) plus a little,
/// its hit area grown to a finger's.
const CHIP_HEIGHT = CONTROL_SIZE.chip;

/// A row's icon at a chip's size, the desktop's 16 points beside text.
function chipIcon(icon: ReactNode): ReactNode {
  return isValidElement<{ size?: number }>(icon) ? cloneElement(icon, { size: 16 }) : icon;
}

/// One property: an icon, its name, its value on the right. With `onPress` it opens its
/// picker (a sheet).
export function Property({
  icon,
  label,
  value,
  valueIcon,
  empty = false,
  valueTone,
  disabled = false,
  onPress,
  ref,
}: {
  /// What a compact menu opened from it sits beside.
  ref?: RefObject<View | null>;
  icon?: ReactNode;
  label: string;
  value: string;
  /// Shown beside the value (a status's symbol).
  valueIcon?: ReactNode;
  /// Nothing is set: a chip says the property's name, faded, rather than "None".
  empty?: boolean;
  /// The value in a colour that warns (a due date that has passed).
  valueTone?: "destructive";
  disabled?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const interactive = Boolean(onPress) && !disabled;
  if (usePropertyLook() === "chip") {
    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        accessibilityState={{ disabled: !interactive }}
        disabled={!interactive}
        onPress={onPress}
        hitSlop={touchSlop(CHIP_HEIGHT, MIN_TOUCH)}
        style={{ height: CHIP_HEIGHT }}
        className="flex-row items-center gap-1.5 rounded-md border border-border px-2.5 active:bg-accent/60"
      >
        {valueIcon ?? chipIcon(icon)}
        <Text tone={empty ? "muted" : (valueTone ?? "default")} numberOfLines={1}>
          {empty ? label : value}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ disabled: !interactive }}
      disabled={!interactive}
      onPress={onPress}
      style={LIST_ROW}
      className="flex-row items-center gap-3 px-1 active:bg-accent/40"
    >
      {icon}
      <Text className="flex-1" numberOfLines={1}>
        {label}
      </Text>
      {valueIcon}
      <Text tone={valueTone ?? "muted"} numberOfLines={1} style={{ maxWidth: "55%" }}>
        {value}
      </Text>
      {interactive ? <IconSelector size={16} color={theme.colors.mutedForeground} /> : null}
    </Pressable>
  );
}
