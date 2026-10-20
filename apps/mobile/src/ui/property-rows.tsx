import { IconX } from "@tabler/icons-react-native";
import { useEffect, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { z } from "zod";
import { Button } from "./Button.tsx";
import { Chip, ChipGroup } from "./Chips.tsx";
import { DatePanel, openAndroidPicker, shownValue } from "./DateField.tsx";
import { Property, useOpenRow } from "./Property.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// The rows of a `PropertyList`, by what they hold: a choice among a few, a day or a time, a
/// line of text, a number, or anything else (`Property` with its own choices inside).

/// One of a few choices: the row says the one picked; open, the choices as chips.
export function ChoiceProperty({
  name,
  icon,
  label,
  value,
  options,
  onChange,
  readOnly = false,
}: {
  name: string;
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: { id: string; label: string; icon?: React.ReactNode }[];
  onChange: (id: string) => void;
  readOnly?: boolean;
}) {
  const row = useOpenRow(name);
  const current = options.find((option) => option.id === value);
  return (
    <Property
      icon={icon}
      label={label}
      value={current?.label ?? ""}
      valueIcon={current?.icon}
      disabled={readOnly}
      expanded={row.open}
      onPress={row.toggle}
    >
      <ChipGroup label={label}>
        {options.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            selected={option.id === value}
            icon={option.icon}
            onPress={() => {
              if (option.id !== value) onChange(option.id);
              row.close();
            }}
          />
        ))}
      </ChipGroup>
    </Property>
  );
}

/// A day or a time of day, picked from the system's own picker (below the row on an iPhone
/// or iPad, a dialog on Android), with Clear and, for a day, the quick picks.
export function DayProperty({
  name,
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
  name: string;
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
  const row = useOpenRow(name);
  const press = () => {
    if (Platform.OS === "android") openAndroidPicker(mode, value, onChange);
    else row.toggle();
  };
  return (
    <Property
      icon={icon}
      label={label}
      value={value ? shownValue(mode, value) : (placeholder ?? "None")}
      disabled={readOnly}
      expanded={row.open}
      onPress={press}
    >
      <DatePanel label={label} mode={mode} value={value} onPick={onChange} onClose={row.close} />
      <View className="flex-row flex-wrap gap-2">
        {(quick ?? []).map((q) => (
          <Button
            key={q.label}
            variant="secondary"
            size="sm"
            label={q.label}
            onPress={() => onChange(q.value)}
          />
        ))}
        {value && clearable ? (
          <Button
            variant="ghost"
            size="sm"
            label={`Clear ${label}`}
            onPress={() => onChange(null)}
          />
        ) : null}
      </View>
    </Property>
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
