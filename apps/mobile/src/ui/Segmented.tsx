import {
  SEGMENTED_CLASSES,
  SEGMENT_CLASSES,
  SEGMENT_IDLE_CLASSES,
  SEGMENT_SELECTED_CLASSES,
} from "@nookly/frontend/classes";
import { Pressable, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { Text } from "./Text.tsx";
import { MIN_TOUCH } from "./touch.ts";
import { haptic } from "./haptics.ts";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/// A few choices side by side, the desktop's segmented control (`SEGMENTED_CLASSES`): a
/// muted track with the chosen one raised on it, never a block of full colour. As tall as a
/// finger needs, each choice an equal share of the width.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
}) {
  const track = splitText(row(SEGMENTED_CLASSES));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ height: MIN_TOUCH }}
      className={cn(track.box, "h-auto w-full p-1")}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const { box, text } = splitText(
          cn(SEGMENT_CLASSES, selected ? SEGMENT_SELECTED_CLASSES : SEGMENT_IDLE_CLASSES),
        );
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (!selected) haptic("select");
              onChange(option.value);
            }}
            className={cn(box, "flex-1 flex-row items-center justify-center gap-1.5 px-2")}
          >
            {option.icon}
            <Text numberOfLines={1} className={cn(text, "text-sm")}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
