import { IconX } from "@tabler/icons-react-native";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { z } from "zod";
import { Button } from "./Button.tsx";
import { shownValue } from "./DateField.tsx";
import { Property } from "./Property.tsx";
import { DayPicker } from "./sheet/DayPicker.tsx";
import { type Option, OptionList } from "./sheet/OptionList.tsx";
import { Sheet, type SheetSize, useSheet } from "./sheet/Sheet.tsx";
import { TimeInput } from "./TimeInput.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// The rows of a `PropertyList`, by what they hold: a choice among a few, a day or a time, a
/// line of text, a number, or anything else (`SheetProperty` with its own picker).

/// A property row that opens its picker in the app's sheet, titled with its name.
export function SheetProperty({
  icon,
  label,
  value,
  valueIcon,
  readOnly = false,
  size,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueIcon?: React.ReactNode;
  readOnly?: boolean;
  size?: SheetSize;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Property
        icon={icon}
        label={label}
        value={value}
        valueIcon={valueIcon}
        disabled={readOnly}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title={label} size={size}>
        {children}
      </Sheet>
    </>
  );
}

/// One of a few choices: the row says the one picked; tapped, the choices in a sheet, as
/// the desktop's property popover lists them.
export function ChoiceProperty<Id extends string>({
  icon,
  label,
  value,
  options,
  onChange,
  readOnly = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: Id;
  options: Option<Id>[];
  onChange: (id: Id) => void;
  readOnly?: boolean;
}) {
  const current = options.find((option) => option.id === value);
  return (
    <SheetProperty
      icon={icon}
      label={label}
      value={current?.label ?? ""}
      valueIcon={current?.icon}
      readOnly={readOnly}
    >
      <OptionList label={label} options={options} value={value} onChange={onChange} />
    </SheetProperty>
  );
}

/// A time of day typed in a sheet, as the desktop's time field, with Clear and Done.
function TimePicker({
  label,
  value,
  onChange,
  clearable = true,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  clearable?: boolean;
}) {
  const sheet = useSheet();
  return (
    <View className="gap-3">
      <TimeInput label={label} value={value} onChange={onChange} autoFocus />
      <View className="flex-row items-center gap-2 border-t border-border pt-2">
        {clearable && value ? (
          <Button
            variant="ghost"
            size="sm"
            label={`Clear ${label}`}
            onPress={() => {
              onChange(null);
              sheet?.close();
            }}
          />
        ) : null}
        <View className="flex-1" />
        <Button variant="secondary" size="sm" label="Done" onPress={() => sheet?.close()} />
      </View>
    </View>
  );
}

/// A day or a time of day: the row says it; tapped, the desktop's calendar (or time field)
/// in a sheet, with the quick picks and Clear.
export function DayProperty({
  icon,
  label,
  mode = "date",
  value,
  placeholder,
  onChange,
  readOnly = false,
  quick,
  clearable = true,
}: {
  icon?: React.ReactNode;
  label: string;
  mode?: "date" | "time";
  value: string | null;
  placeholder?: string;
  onChange: (value: string | null) => void;
  readOnly?: boolean;
  /// Buttons beside Clear: `Today`, `Tomorrow`.
  quick?: { label: string; value: string }[];
  /// Whether the value can be taken away (a session always has a day).
  clearable?: boolean;
}) {
  return (
    <SheetProperty
      icon={icon}
      label={label}
      value={value ? shownValue(mode, value) : (placeholder ?? "None")}
      readOnly={readOnly}
    >
      {mode === "date" ? (
        <DayPicker
          label={label}
          value={value}
          onChange={onChange}
          quick={quick}
          clearable={clearable}
        />
      ) : (
        <TimePicker label={label} value={value} onChange={onChange} clearable={clearable} />
      )}
    </SheetProperty>
  );
}

/// A line of text edited in place: its value sits on the right of the row and saves when
/// typing ends. Blank clears it.
export function TextRow({
  icon,
  label,
  value,
  placeholder,
  onSave,
  readOnly = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null;
  placeholder?: string;
  onSave: (value: string | null) => void;
  readOnly?: boolean;
}) {
  const theme = useTheme();
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <View className="min-h-12 flex-row items-center gap-3 px-4">
      {icon}
      <Text numberOfLines={1}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={text}
        editable={!readOnly}
        placeholder={placeholder ?? "None"}
        placeholderTextColor={theme.colors.mutedForeground}
        onChangeText={setText}
        onEndEditing={() => {
          const next = text.trim() || null;
          if (next !== value) onSave(next);
        }}
        returnKeyType="done"
        className="h-12 flex-1 text-right font-sans text-sm text-muted-foreground"
      />
    </View>
  );
}

/// "", or a number written with a dot or a comma.
const numberText = z.union([
  z.literal("").transform(() => null),
  z
    .string()
    .transform((t) => Number(t.replace(",", ".")))
    .pipe(z.number().finite().min(0)),
]);

/// A number edited in place, like `TextRow`. Blank clears it; what is not a number says so.
export function NumberRow({
  icon,
  label,
  value,
  placeholder,
  onSave,
  readOnly = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | null;
  placeholder?: string;
  onSave: (value: number | null) => void;
  readOnly?: boolean;
}) {
  const theme = useTheme();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const parsed = numberText.safeParse(text.trim());
  return (
    <View>
      <View className="min-h-12 flex-row items-center gap-3 px-4">
        {icon}
        <Text numberOfLines={1}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          value={text}
          editable={!readOnly}
          placeholder={placeholder ?? "None"}
          placeholderTextColor={theme.colors.mutedForeground}
          keyboardType="decimal-pad"
          onChangeText={setText}
          onEndEditing={() => parsed.success && parsed.data !== value && onSave(parsed.data)}
          className="h-12 flex-1 text-right font-sans text-sm text-muted-foreground"
        />
      </View>
      {parsed.success ? null : (
        <View className="flex-row items-center gap-1 px-4 pb-2">
          <IconX size={12} color={theme.colors.destructive} />
          <Text variant="small" tone="destructive">
            Enter a number, like 1.7
          </Text>
        </View>
      )}
    </View>
  );
}

/// A property that is only read: a kind, a date added, a path.
export function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return <Property icon={icon} label={label} value={value} />;
}
