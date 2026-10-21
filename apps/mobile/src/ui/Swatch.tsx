import { COLOR_SWATCH_CLASSES, COLOR_SWATCH_SELECTED_CLASSES } from "@nookly/frontend/classes";
import { Pressable, View } from "react-native";
import { cn } from "./classes.ts";
import { MIN_TOUCH } from "./touch.ts";

/// One color to pick, the desktop's swatch (`COLOR_SWATCH_CLASSES`) at its own size, in a
/// cell a finger can hit. Rows of them sit with no gap: the cells keep them apart.
export function Swatch({
  label,
  color,
  selected,
  onPress,
  className = COLOR_SWATCH_CLASSES,
  selectedClassName = COLOR_SWATCH_SELECTED_CLASSES,
}: {
  label: string;
  /// Null draws an empty ring (no tint).
  color: string | null;
  selected: boolean;
  onPress: () => void;
  className?: string;
  selectedClassName?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH }}
      className="items-center justify-center"
    >
      <View
        className={cn(
          className,
          color === null && "border border-border",
          selected && selectedClassName,
        )}
        style={color ? { backgroundColor: color } : undefined}
      />
    </Pressable>
  );
}
