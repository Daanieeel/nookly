import { SHARED_SETTINGS, type SharedSettingId } from "@nookly/shared/settings";
import { CODE_LANGUAGE_MARKS } from "@nookly/frontend/lib/code-language-marks";
import { useEffect, useState } from "react";
import { Switch, TextInput, View } from "react-native";
import type { SettingJson } from "@nookly/shared/settings";
import { phoneSettings, useSettingJson } from "../../data/settings.ts";
import { Button } from "../../ui/Button.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { useScheme, useSemantic } from "../../ui/kit/scheme.ts";
import { LanguageMark } from "../../ui/LanguageMark.tsx";
import { NumberInput } from "../../ui/NumberInput.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import type { Option } from "../../ui/sheet/OptionList.tsx";
import { FACE, GUTTER, RADIUS, SPACE, TINT, TYPE } from "../../ui/tokens.ts";
import { MIN_TOUCH } from "../../ui/touch.ts";
import { formatOptions, timezoneOptions } from "./datetime-options.tsx";
import { ThemeCards } from "./ThemeCards.tsx";
import { type Control, SETTING_UI } from "./spec.ts";
import { haptic } from "../../ui/haptics.ts";

/// A number with the desktop's minus, value and plus, and its unit beside it.
function NumberControl({
  id,
  control,
}: {
  id: SharedSettingId;
  control: Extract<Control, { kind: "stepper" }>;
}) {
  const value = Number(useSettingJson(id));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
      <NumberInput
        label={SHARED_SETTINGS[id].title}
        value={value}
        min={control.min}
        max={control.max}
        step={control.step}
        increments={control.increments}
        onChange={(next) => void phoneSettings.setJson(id, next)}
      />
      {control.unit ? (
        <Label type="subheadline" color="secondaryLabel">
          {control.unit}
        </Label>
      ) : null}
    </View>
  );
}

/// A text setting typed in a box under its title, saved when the field loses focus, kept
/// as typed while it is wrong.
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
  const fill = useSemantic("fill");
  const text = useSemantic("label");
  const muted = useSemantic("tertiaryLabel");
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
    <View style={{ gap: SPACE.xxs }}>
      <TextInput
        accessibilityLabel={SHARED_SETTINGS[id].title}
        value={draft}
        multiline={control.multiline}
        placeholder={control.placeholder}
        placeholderTextColor={muted}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        maxFontSizeMultiplier={2}
        style={{
          minHeight: control.multiline ? 120 : MIN_TOUCH,
          paddingHorizontal: SPACE.md,
          paddingVertical: control.multiline ? SPACE.sm : 0,
          borderRadius: RADIUS.control,
          borderCurve: "continuous",
          backgroundColor: fill,
          fontFamily: control.multiline ? "Menlo" : FACE["400"],
          fontSize: control.multiline ? 14 : TYPE.body.fontSize,
          color: text,
        }}
        textAlignVertical={control.multiline ? "top" : "center"}
      />
      {error ? (
        <Label type="footnote" tint={TINT.red[useScheme()]}>
          {error}
        </Label>
      ) : null}
    </View>
  );
}

/// A choice from a list in a sheet, shown as a filled button under the title.
function Picker({
  id,
  options,
  onChange,
}: {
  id: SharedSettingId;
  options: Option[];
  onChange: (next: string) => void;
}) {
  const fill = useSemantic("fill");
  return (
    <View
      style={{ borderRadius: RADIUS.control, borderCurve: "continuous", backgroundColor: fill }}
    >
      <View style={{ paddingHorizontal: SPACE.md, flexDirection: "row" }}>
        <SelectField
          label={SHARED_SETTINGS[id].title}
          showLabel={false}
          value={String(useSettingJson(id))}
          options={options}
          onChange={onChange}
        />
      </View>
    </View>
  );
}

/// A code block without a language, as the desktop stores it.
const PLAIN_TEXT = "plaintext";

const LANGUAGE_OPTIONS: Option[] = [
  { id: PLAIN_TEXT, label: "Plain Text", icon: <LanguageMark language={PLAIN_TEXT} /> },
  ...CODE_LANGUAGE_MARKS.map((lang) => ({
    id: lang.value,
    label: lang.label,
    icon: <LanguageMark language={lang.value} />,
  })),
];

/// What edits the setting, under its title.
function Editor({ id, control }: { id: SharedSettingId; control: Control }) {
  const value = useSettingJson(id);
  // The setting checks the value against its own schema and refuses one that fails.
  const set = (next: SettingJson) => void phoneSettings.setJson(id, next);
  switch (control.kind) {
    case "switch":
      return null;
    case "text":
      return <TextControl id={id} control={control} />;
    case "stepper":
      return <NumberControl id={id} control={control} />;
    case "cards":
      return (
        <ThemeCards
          label={SHARED_SETTINGS[id].title}
          value={String(value)}
          choices={control.options}
          onChange={set}
        />
      );
    case "timezone":
      return <Picker id={id} options={timezoneOptions()} onChange={set} />;
    case "format":
      return <Picker id={id} options={formatOptions(control.of)} onChange={set} />;
    case "codeLanguage":
      return <Picker id={id} options={LANGUAGE_OPTIONS} onChange={set} />;
    case "choice": {
      const pick = (next: string) =>
        set(control.options.find((o) => String(o.value) === next)?.value ?? next);
      return control.options.length <= 3 ? (
        <Segmented
          label={SHARED_SETTINGS[id].title}
          value={String(value)}
          options={control.options.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={pick}
        />
      ) : (
        <Picker
          id={id}
          options={control.options.map((o) => ({ id: String(o.value), label: o.label }))}
          onChange={pick}
        />
      );
    }
  }
}

/// One setting as a row of an iOS grouped list, laid out as the desktop's: its key small
/// above its title, what it does under that, and what edits it under them at full width,
/// so a long title is never cut off. A switch stays at the end of the title, as iOS puts it.
/// Once changed, a way back to the default.
export function SettingRow({ id }: { id: SharedSettingId }) {
  const scheme = useScheme();
  const def = SHARED_SETTINGS[id];
  const { control } = SETTING_UI[id];
  const value = useSettingJson(id);
  const changed = !phoneSettings.isDefault(id);
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingVertical: SPACE.md, gap: SPACE.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label type="caption" color="tertiaryLabel" style={{ fontFamily: "Menlo" }}>
            {id}
          </Label>
          <Label accessibilityRole="header" weight="500">
            {def.title}
          </Label>
          <Label type="footnote" color="secondaryLabel">
            {def.description}
          </Label>
        </View>
        {control.kind === "switch" ? (
          <Switch
            accessibilityLabel={def.title}
            value={value === true}
            onValueChange={(next) => {
              haptic("toggle");
              void phoneSettings.setJson(id, next);
            }}
            trackColor={{ true: TINT.green[scheme] }}
          />
        ) : null}
      </View>
      <Editor id={id} control={control} />
      {changed ? <ResetLink id={id} /> : null}
    </View>
  );
}

/// Back to the default, in the accent, as iOS words a plain button.
function ResetLink({ id }: { id: SharedSettingId }) {
  return (
    <View style={{ alignItems: "flex-start" }}>
      <Button
        label="Reset to Default"
        variant="link"
        size="sm"
        onPress={() => phoneSettings.reset(id)}
      />
    </View>
  );
}
