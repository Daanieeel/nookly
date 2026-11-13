import { SHARED_SETTINGS, type SharedSettingId } from "@nookly/shared/settings";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { phoneSettings, useSettingJson } from "../../data/settings.ts";
import { Button } from "../../ui/Button.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Field } from "../../ui/Field.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { useScheme } from "../../ui/kit/scheme.ts";
import { SelectField } from "../../ui/SelectField.tsx";
import { GUTTER, SPACE, TINT } from "../../ui/tokens.ts";
import { type Control, SETTING_UI } from "./spec.ts";
import { haptic } from "../../ui/haptics.ts";

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
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.xs }}>
      <Label
        accessibilityLiveRegion="polite"
        color="secondaryLabel"
        style={{ marginRight: SPACE.xs }}
      >
        {value} {control.unit}
      </Label>
      <Button
        label="Less"
        variant="secondary"
        size="sm"
        disabled={value <= control.min}
        onPress={() => set(value - control.step)}
      />
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

/// One setting as a row of an iOS grouped list (D50): its title with what it does under it,
/// a switch, a value or a stepper at the end, two or three choices as a segmented control
/// under them, and a way back to the default once it was changed.
export function SettingRow({ id }: { id: SharedSettingId }) {
  const scheme = useScheme();
  const def = SHARED_SETTINGS[id];
  const { control } = SETTING_UI[id];
  const value = useSettingJson(id);
  const changed = !phoneSettings.isDefault(id);
  if (control.kind === "text") {
    return (
      <View>
        <TextControl id={id} control={control} />
        <Label
          type="footnote"
          color="secondaryLabel"
          style={{ paddingHorizontal: GUTTER, paddingBottom: SPACE.sm }}
        >
          {def.description}
        </Label>
        {changed ? <ResetLink id={id} /> : null}
      </View>
    );
  }
  const pick = (next: string) =>
    phoneSettings.setJson(
      id,
      control.kind === "choice"
        ? (control.options.find((o) => String(o.value) === next)?.value ?? next)
        : next,
    );
  const segmented = control.kind === "choice" && control.options.length <= 3;
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingVertical: SPACE.md - 2, gap: SPACE.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label accessibilityRole="header">{def.title}</Label>
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
        {control.kind === "choice" && !segmented ? (
          <View style={{ maxWidth: "50%" }}>
            <SelectField
              label={def.title}
              showLabel={false}
              value={String(value)}
              options={control.options.map((o) => ({ id: String(o.value), label: o.label }))}
              onChange={pick}
            />
          </View>
        ) : null}
        {control.kind === "stepper" ? <Stepper id={id} control={control} /> : null}
      </View>
      {segmented && control.kind === "choice" ? (
        <Segmented
          label={def.title}
          value={String(value)}
          options={control.options.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={pick}
        />
      ) : null}
      {changed ? <ResetLink id={id} inset={false} /> : null}
    </View>
  );
}

/// Back to the default, in the accent, as iOS words a plain button.
function ResetLink({ id, inset = true }: { id: SharedSettingId; inset?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: inset ? GUTTER : 0,
        paddingBottom: inset ? SPACE.sm : 0,
        alignItems: "flex-start",
      }}
    >
      <Button
        label="Reset to Default"
        variant="link"
        size="sm"
        onPress={() => phoneSettings.reset(id)}
      />
    </View>
  );
}
