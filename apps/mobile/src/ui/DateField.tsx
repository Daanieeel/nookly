import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { IconX } from "@tabler/icons-react-native";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { dayLabel, localDay } from "../screens/dates.ts";
import { IconButton } from "./Button.tsx";
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
  const text = value
    ? shown(mode, value)
    : (placeholder ?? (mode === "date" ? "No day" : "No time"));
  return (
    <View style={{ gap: theme.space(1) }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(1) }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${text}`}
          accessibilityHint={
            readOnly ? undefined : `Opens a ${mode === "date" ? "calendar" : "clock"}`
          }
          accessibilityState={{ disabled: readOnly, expanded: open }}
          disabled={readOnly}
          onPress={press}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 40,
            justifyContent: "center",
            paddingHorizontal: theme.space(3),
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: open ? theme.colors.ring : theme.colors.input,
            backgroundColor: theme.colors.secondary,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text tone={value ? "default" : "muted"}>{text}</Text>
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
