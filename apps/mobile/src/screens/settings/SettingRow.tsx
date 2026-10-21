import { SHARED_SETTINGS, type SharedSettingId } from "@nookly/shared/settings";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { phoneSettings, useSettingJson } from "../../data/settings.ts";
import { Button } from "../../ui/Button.tsx";
import { Chip, ChipGroup } from "../../ui/Chips.tsx";
import { Field } from "../../ui/Field.tsx";
import { ROW_DIVIDER } from "../../ui/Row.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { cn } from "../../ui/classes.ts";
import { type Control, SETTING_UI } from "./spec.ts";

/// A number with plus and minus, for a length or an hour.
function Stepper({
  id,
  control,
}: {
  id: SharedSettingId;
  control: Extract<Control, { kind: "stepper" }>;
}) {
  const value = Number(useSettingJson(id));
  const set = (next: number) =>
    phoneSettings.setJson(id, Math.min(control.max, Math.max(control.min, next)));
  return (
    <View className="flex-row items-center gap-3">
      <Button
        label="Less"
        variant="secondary"
        size="sm"
        disabled={value <= control.min}
        onPress={() => set(value - control.step)}
      />
      <Text accessibilityLiveRegion="polite" className="min-w-16 text-center">
        {value} {control.unit}
      </Text>
      <Button
        label="More"
        variant="secondary"
        size="sm"
        disabled={value >= control.max}
        onPress={() => set(value + control.step)}
      />
    </View>
  );
}

/// A text setting, saved when the field loses focus, kept as typed while it is wrong.
function TextControl({
  id,
  control,
}: {
  id: SharedSettingId;
  control: Extract<Control, { kind: "text" }>;
}) {
  const stored = String(useSettingJson(id));
  const [draft, setDraft] = useState(stored);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => setDraft(stored), [stored]);
  const commit = () => {
    if (draft === stored) return;
    if (draft === "" && !control.allowEmpty) {
      phoneSettings.reset(id);
      setError(undefined);
      return;
    }
    const ok = phoneSettings.setJson(id, draft);
    setError(ok ? undefined : "That isn't a valid value for this setting.");
  };
  return (
    <Field
      label={SHARED_SETTINGS[id].title}
      value={draft}
      multiline={control.multiline}
      placeholder={control.placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      error={error}
    />
  );
}

/// One setting, as the desktop's Settings row: its title and what it does, the control,
/// and a way back to the default once it was changed.
export function SettingRow({ id }: { id: SharedSettingId }) {
  const theme = useTheme();
  const def = SHARED_SETTINGS[id];
  const { control } = SETTING_UI[id];
  const value = useSettingJson(id);
  const changed = !phoneSettings.isDefault(id);
  return (
    <View className={cn("gap-2 p-4", ROW_DIVIDER)}>
      {control.kind !== "text" && (
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 font-medium" accessibilityRole="header">
            {def.title}
          </Text>
          {control.kind === "switch" && (
            <Switch
              accessibilityLabel={def.title}
              value={value === true}
              onValueChange={(next) => void phoneSettings.setJson(id, next)}
              trackColor={{ true: theme.colors.primary }}
            />
          )}
        </View>
      )}
      <Text variant="small" tone="muted">
        {def.description}
      </Text>
      {/* As on the desktop: two or three choices side by side, more in a select. */}
      {control.kind === "choice" && control.options.length <= 3 && (
        <ChipGroup label={def.title} stretch>
          {control.options.map((option) => (
            <Chip
              key={String(option.value)}
              label={option.label}
              selected={value === option.value}
              onPress={() => phoneSettings.setJson(id, option.value)}
            />
          ))}
        </ChipGroup>
      )}
      {control.kind === "choice" && control.options.length > 3 && (
        <SelectField
          label={def.title}
          showLabel={false}
          value={String(value)}
          options={control.options.map((o) => ({ id: String(o.value), label: o.label }))}
          onChange={(next) =>
            phoneSettings.setJson(
              id,
              control.options.find((o) => String(o.value) === next)?.value ?? next,
            )
          }
        />
      )}
      {control.kind === "stepper" && <Stepper id={id} control={control} />}
      {control.kind === "text" && <TextControl id={id} control={control} />}
      {changed && (
        <Button
          label="Reset to Default"
          variant="ghost"
          size="sm"
          onPress={() => phoneSettings.reset(id)}
        />
      )}
    </View>
  );
}
