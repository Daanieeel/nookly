import { IconX } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { dayLabel, localDay } from "../screens/dates.ts";
import { FormRow, RowLabel } from "./kit/Form.tsx";
import { Glyph } from "./kit/Glyph.tsx";
import { useSemanticPair } from "./kit/scheme.ts";
import { SheetTrigger } from "./SelectField.tsx";
import { DayPicker } from "./sheet/DayPicker.tsx";
import { Sheet } from "./sheet/Sheet.tsx";
import { TimeInput, clockText } from "./TimeInput.tsx";
import { GUTTER, SPACE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// The words a day (`YYYY-MM-DD`) or a time (`HH:MM`) is shown in: a time on the clock the
/// time format asks for (`twelve`).
export function shownValue(mode: "date" | "time", value: string, twelve = false): string {
  return mode === "date" ? dayLabel(value) : clockText(value, twelve);
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
  const [open, setOpen] = useState(false);
  const muted = useSemanticPair("tertiaryLabel");
  const clear =
    clearable && value && !readOnly ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Clear ${label}`}
        onPress={() => onChange(null)}
        hitSlop={12}
        style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}
      >
        <Glyph icon={IconX} size={17} color={muted.hex} />
      </Pressable>
    ) : null;
  if (mode === "time") {
    return (
      <FormRow>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.sm,
            paddingHorizontal: GUTTER,
            minHeight: MIN_TOUCH + 4,
          }}
        >
          <View style={{ flex: 1 }}>
            <RowLabel label={label} />
          </View>
          <TimeInput label={label} value={value} onChange={onChange} />
          {clear}
        </View>
      </FormRow>
    );
  }
  return (
    <>
      <SheetTrigger
        label={label}
        text={value ? shownValue("date", value) : null}
        placeholder={placeholder ?? "None"}
        disabled={readOnly}
        hint="Opens a calendar"
        onPress={() => setOpen(true)}
        trailing={clear ?? undefined}
      />
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <DayPicker
          label={label}
          value={value}
          onChange={onChange}
          clearable={clearable}
          quick={[{ label: "Today", value: localDay() }]}
        />
      </Sheet>
    </>
  );
}
