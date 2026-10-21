import { View } from "react-native";
import { Button } from "../Button.tsx";
import { CalendarPanel } from "./CalendarPanel.tsx";
import { useSheet } from "./Sheet.tsx";

/// A day picked in a sheet, as the desktop's `DateInput` popover: its calendar, then a
/// line with the quick picks (Today, Tomorrow) and Clear. Picking closes the sheet, unless
/// `then` continues on another step (a time after the day).
export function DayPicker({
  label,
  value,
  onChange,
  quick = [],
  clearable = true,
  then,
}: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  quick?: { label: string; value: string }[];
  clearable?: boolean;
  then?: (day: string) => void;
}) {
  const sheet = useSheet();
  const choose = (day: string | null) => {
    if (day !== value) onChange(day);
    if (day !== null && then) then(day);
    else sheet?.close();
  };
  return (
    <View className="gap-2">
      <CalendarPanel value={value} onSelect={choose} />
      {quick.length > 0 || (clearable && value) ? (
        <View className="flex-row items-center gap-2 border-t border-border pt-2">
          {quick.map((q) => (
            <Button
              key={q.label}
              variant="ghost"
              size="sm"
              label={q.label}
              onPress={() => choose(q.value)}
            />
          ))}
          <View className="flex-1" />
          {clearable && value ? (
            <Button
              variant="ghost"
              size="sm"
              label={`Clear ${label}`}
              onPress={() => choose(null)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
