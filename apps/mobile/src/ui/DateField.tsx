import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { IconX } from "@tabler/icons-react-native";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { dayLabel, localDay } from "../screens/dates.ts";
import { FORM_FIELD_CLASSES } from "@nookly/frontend/classes";
import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconButton } from "./Button.tsx";
import { cn, row, splitText } from "./classes.ts";
import { FieldLabel } from "./Field.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/// `YYYY-MM-DD` or `HH:MM`, as the desktop stores it, to a time today or on that day.
function toDate(mode: "date" | "time", value: string | null): Date {
  const now = new Date();
  if (!value) return now;
  if (mode === "date") {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const [h, min] = value.split(":").map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
}

function fromDate(mode: "date" | "time", date: Date): string {
  return mode === "date" ? localDay(date) : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shown(mode: "date" | "time", value: string): string {
  if (mode === "date") return dayLabel(value);
  return toDate("time", value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/// A day or a time picked from the system's own picker, stored as the desktop stores
/// it. On iPhone the calendar opens below the field; on Android, as a dialog.
export function DateField({
  label,
  value,
  onChange,
  mode = "date",
  placeholder,
  clearable = true,
  readOnly = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  mode?: "date" | "time";
  placeholder?: string;
  clearable?: boolean;
  readOnly?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const pick = (date: Date) => onChange(fromDate(mode, date));
  const press = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: toDate(mode, value),
        mode,
        is24Hour: true,
        onValueChange: (_, date) => pick(date),
      });
    } else {
      setOpen((o) => !o);
    }
  };
  const input = splitText(row(INPUT_CLASSES));
  const text = value
    ? shown(mode, value)
    : (placeholder ?? (mode === "date" ? "No day" : "No time"));
  return (
    <View className={FORM_FIELD_CLASSES}>
      <FieldLabel label={label} />
      <View className="flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${text}`}
          accessibilityHint={
            readOnly ? undefined : `Opens a ${mode === "date" ? "calendar" : "clock"}`
          }
          accessibilityState={{ disabled: readOnly, expanded: open }}
          disabled={readOnly}
          onPress={press}
          className={cn(input.box, "h-10 flex-1 items-center", open && "border-ring")}
        >
          <Text className={cn(input.text, !value && "text-muted-foreground")}>{text}</Text>
        </Pressable>
        {clearable && value && !readOnly ? (
          <IconButton
            label={`Clear ${label}`}
            icon={<IconX size={18} color={theme.colors.mutedForeground} />}
            onPress={() => {
              setOpen(false);
              onChange(null);
            }}
          />
        ) : null}
      </View>
      {open && Platform.OS !== "android" ? (
        <DateTimePicker
          testID={`${label} picker`}
          value={toDate(mode, value)}
          mode={mode}
          display={mode === "date" ? "inline" : "spinner"}
          accentColor={theme.colors.primary}
          themeVariant={theme.dark ? "dark" : "light"}
          onValueChange={(_, date) => {
            pick(date);
            if (mode === "date") setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
