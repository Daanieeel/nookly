import { FORM_FIELD_CLASSES } from "@nookly/frontend/classes";
import { IconCalendarEvent, IconX } from "@tabler/icons-react-native";
import { useState } from "react";
import { View } from "react-native";
import { dayLabel, localDay } from "../screens/dates.ts";
import { IconButton } from "./Button.tsx";
import { FieldLabel } from "./Field.tsx";
import { SheetTrigger } from "./SelectField.tsx";
import { DayPicker } from "./sheet/DayPicker.tsx";
import { Sheet } from "./sheet/Sheet.tsx";
import { TimeInput } from "./TimeInput.tsx";
import { useTheme } from "./theme.ts";

/// The words a day (`YYYY-MM-DD`) or a time (`HH:MM`) is shown in.
export function shownValue(mode: "date" | "time", value: string): string {
  if (mode === "date") return dayLabel(value);
  const [h, m] = value.split(":").map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  );
}

/// A day or a time in a form, stored as the desktop stores it. A day is the desktop's
/// `DateInput`: a field showing it, which opens the desktop's calendar in a sheet. A time
/// is the desktop's `TimeInput`, typed in place.
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
  const clear =
    clearable && value && !readOnly ? (
      <IconButton
        label={`Clear ${label}`}
        icon={<IconX size={18} color={theme.colors.mutedForeground} />}
        onPress={() => onChange(null)}
      />
    ) : null;
  if (mode === "time") {
    return (
      <View className={FORM_FIELD_CLASSES}>
        <FieldLabel label={label} />
        <View className="flex-row items-center gap-1">
          <TimeInput label={label} value={value} onChange={onChange} />
          {clear}
        </View>
      </View>
    );
  }
  return (
    <View className={FORM_FIELD_CLASSES}>
      <FieldLabel label={label} />
      <View className="flex-row items-center gap-1">
        <SheetTrigger
          label={label}
          text={value ? shownValue("date", value) : null}
          placeholder={placeholder ?? "Pick a date…"}
          icon={<IconCalendarEvent size={16} color={theme.colors.mutedForeground} />}
          disabled={readOnly}
          hint="Opens a calendar"
          onPress={() => setOpen(true)}
        />
        {clear}
      </View>
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <DayPicker
          label={label}
          value={value}
          onChange={onChange}
          clearable={clearable}
          quick={[{ label: "Today", value: localDay() }]}
        />
      </Sheet>
    </View>
  );
}
