import { IconSelector } from "@tabler/icons-react-native";
import { type ReactNode, type RefObject, useState } from "react";
import { Pressable, View } from "react-native";
import { FormRow, RowLabel } from "./kit/Form.tsx";
import { Glyph } from "./kit/Glyph.tsx";
import { Label } from "./kit/Label.tsx";
import { useSemantic, useSemanticPair } from "./kit/scheme.ts";
import { type Option, OptionList } from "./sheet/OptionList.tsx";
import { Sheet } from "./sheet/Sheet.tsx";
import { GUTTER, SPACE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// The trigger of a field that opens a sheet, as an iOS form row (D52): the field's name at
/// the start, the value (or a muted placeholder) at the end with an icon before it and the
/// up and down chevrons of a pop up button. `showLabel` off draws only the value and the
/// chevrons, for a row that names it already (a setting).
export function SheetTrigger({
  label,
  text,
  icon,
  placeholder,
  trailing,
  disabled = false,
  hint,
  onPress,
  ref,
  showLabel = true,
  required,
  error,
}: {
  ref?: RefObject<View | null>;
  label: string;
  text: string | null;
  icon?: ReactNode;
  placeholder: string;
  trailing?: ReactNode;
  disabled?: boolean;
  hint?: string;
  onPress: () => void;
  showLabel?: boolean;
  required?: boolean;
  error?: string | null;
}) {
  const pressed = useSemantic("pressed");
  const muted = useSemanticPair("tertiaryLabel");
  const button = (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${text ?? placeholder}`}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      unstable_pressDelay={0}
      style={({ pressed: down }) => ({
        flex: showLabel ? undefined : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.sm,
        minHeight: MIN_TOUCH + (showLabel ? 4 : 0),
        paddingHorizontal: showLabel ? GUTTER : 0,
        backgroundColor: down && showLabel ? pressed : undefined,
        opacity: disabled ? 0.45 : down && !showLabel ? 0.5 : 1,
      })}
    >
      {showLabel ? (
        <View style={{ flexShrink: 0, maxWidth: "45%" }}>
          <RowLabel label={label} required={required} />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: showLabel ? "flex-end" : "flex-start",
          gap: SPACE.sm,
        }}
      >
        {icon}
        <Label
          numberOfLines={1}
          color={text ? "secondaryLabel" : "tertiaryLabel"}
          style={{ flexShrink: 1 }}
        >
          {text ?? placeholder}
        </Label>
      </View>
      {trailing ?? <Glyph icon={IconSelector} size={13} color={muted.hex} />}
    </Pressable>
  );
  return showLabel ? <FormRow error={error}>{button}</FormRow> : button;
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
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  const list = <OptionList label={label} options={options} value={value} onChange={onChange} />;
  return (
    <>
      {options.length === 0 && empty ? (
        <FormRow>
          <View style={{ paddingHorizontal: GUTTER, paddingVertical: SPACE.md, gap: SPACE.xxs }}>
            <RowLabel label={label} required={required} />
            <Label type="subheadline" color="secondaryLabel">
              {empty}
            </Label>
          </View>
        </FormRow>
      ) : (
        <SheetTrigger
          label={label}
          showLabel={showLabel}
          required={required}
          text={current?.label ?? null}
          icon={current?.icon}
          placeholder={placeholder}
          disabled={disabled}
          onPress={() => setOpen(true)}
        />
      )}
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        {list}
      </Sheet>
    </>
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
  const [open, setOpen] = useState(false);
  const names = options.filter((o) => values.includes(o.id)).map((o) => o.label);
  return (
    <>
      <SheetTrigger
        label={label}
        text={names.length > 0 ? names.join(", ") : null}
        placeholder={placeholder}
        disabled={disabled}
        onPress={() => setOpen(true)}
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
    </>
  );
}
