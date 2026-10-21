import { FORM_FIELD_CLASSES } from "@nookly/frontend/classes";
import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconSelector } from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { FieldLabel } from "./Field.tsx";
import { type Option, OptionList } from "./sheet/OptionList.tsx";
import { Sheet } from "./sheet/Sheet.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { FIELD_HEIGHT } from "./touch.ts";

/// The trigger of a field that opens a sheet: the desktop's select button, its label
/// above, the value (or a muted placeholder) and an icon on the right.
export function SheetTrigger({
  label,
  text,
  icon,
  placeholder,
  trailing,
  disabled = false,
  hint,
  onPress,
}: {
  label: string;
  text: string | null;
  icon?: ReactNode;
  placeholder: string;
  trailing?: ReactNode;
  disabled?: boolean;
  hint?: string;
  onPress: () => void;
}) {
  const input = splitText(row(INPUT_CLASSES));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${text ?? placeholder}`}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={FIELD_HEIGHT}
      className={cn(input.box, "flex-1 items-center gap-2 px-2.5 active:bg-accent/80")}
    >
      {icon}
      <Text
        numberOfLines={1}
        className={cn(input.text, "flex-1", !text && "text-muted-foreground")}
      >
        {text ?? placeholder}
      </Text>
      {trailing}
    </Pressable>
  );
}

/// The desktop's `SelectField` with its label: a button showing the choice, which opens the
/// choices in a sheet. A Space, a Course, a term.
export function SelectField<Id extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  required,
  disabled = false,
  empty,
  showLabel = true,
}: {
  label: string;
  /// Off where the label already stands above it (a setting's row).
  showLabel?: boolean;
  value: Id | null;
  options: Option<Id>[];
  onChange: (id: Id) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /// Said instead of the field when there is nothing to choose.
  empty?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <View className={FORM_FIELD_CLASSES}>
      {showLabel ? <FieldLabel label={label} required={required} /> : null}
      {options.length === 0 && empty ? (
        <Text tone="muted">{empty}</Text>
      ) : (
        <View className="flex-row">
          <SheetTrigger
            label={label}
            text={current?.label ?? null}
            icon={current?.icon}
            placeholder={placeholder}
            disabled={disabled}
            onPress={() => setOpen(true)}
            trailing={<IconSelector size={16} color={theme.colors.mutedForeground} />}
          />
        </View>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <OptionList label={label} options={options} value={value} onChange={onChange} />
      </Sheet>
    </View>
  );
}

/// Several of a set picked in a sheet (tags): the button lists them, the sheet ticks them
/// and stays open to tick more.
export function MultiSelectField<Id extends string>({
  label,
  values,
  options,
  onChange,
  placeholder = "None",
  disabled = false,
}: {
  label: string;
  values: Id[];
  options: Option<Id>[];
  onChange: (ids: Id[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const names = options.filter((o) => values.includes(o.id)).map((o) => o.label);
  return (
    <View className="flex-row">
      <SheetTrigger
        label={label}
        text={names.length > 0 ? names.join(", ") : null}
        placeholder={placeholder}
        disabled={disabled}
        onPress={() => setOpen(true)}
        trailing={<IconSelector size={16} color={theme.colors.mutedForeground} />}
      />
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <OptionList
          label={label}
          multiple
          values={values}
          options={options}
          onToggle={(id, on) => onChange(on ? [...values, id] : values.filter((v) => v !== id))}
        />
      </Sheet>
    </View>
  );
}
