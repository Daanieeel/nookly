import type { Cadence, RepeatPlan, RepeatRule } from "@nookly/shared/data";
import { IconRepeat } from "@tabler/icons-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../ui/Button.tsx";
import { shownValue } from "../ui/DateField.tsx";
import { NumberInput } from "../ui/NumberInput.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { CalendarPanel } from "../ui/sheet/CalendarPanel.tsx";
import { PillSheet } from "../ui/sheet/Compose.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { SPACE } from "../ui/tokens.ts";

/// How things repeat, with the desktop's words and choices (`repeat-chip.tsx` for
/// sessions and calendar entries, `RepeatPicker.tsx` for tasks).

const CADENCES: { id: Cadence; label: string }[] = [
  { id: "none", label: "Does not repeat" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const UNITS = ["days", "weeks", "months", "years"] as const;

/// "Weekly for 16 weeks", "Daily until Mar 20", or null when it does not repeat.
export function repeatPlanLabel(plan: RepeatPlan): string | null {
  const cadence = CADENCES.find((c) => c.id === plan.cadence)?.label ?? "";
  if (plan.cadence === "none") return null;
  if (plan.endMode === "until") {
    return plan.until ? `${cadence} until ${shownValue("date", plan.until)}` : cadence;
  }
  const unit = plan.durationCount === 1 ? plan.durationUnit.slice(0, -1) : plan.durationUnit;
  return `${cadence} for ${plan.durationCount} ${unit}`;
}

/// How a new session or entry repeats, as a pill: the cadence, then for how long or until
/// which day, in a card.
export function RepeatPill({
  value,
  onChange,
}: {
  value: RepeatPlan;
  onChange: (plan: RepeatPlan) => void;
}) {
  const theme = useTheme();
  return (
    <PillSheet
      label="Repeat"
      icon={<IconRepeat size={18} color={theme.colors.mutedForeground} />}
      value={repeatPlanLabel(value)}
    >
      <RepeatPlanPicker value={value} onChange={onChange} />
    </PillSheet>
  );
}

function RepeatPlanPicker({
  value,
  onChange,
}: {
  value: RepeatPlan;
  onChange: (plan: RepeatPlan) => void;
}) {
  const sheet = useSheet();
  return (
    <View style={{ gap: SPACE.lg }}>
      <OptionList
        label="Repeat"
        value={value.cadence}
        options={CADENCES}
        // The rest of the card is still to be set; the list stays.
        afterPick={() => undefined}
        onChange={(cadence) => onChange({ ...value, cadence })}
      />
      {value.cadence === "none" ? null : (
        <>
          <Segmented
            label="Ends"
            value={value.endMode}
            options={[
              { value: "for", label: "For a while" },
              { value: "until", label: "Until a day" },
            ]}
            onChange={(endMode) => onChange({ ...value, endMode })}
          />
          {value.endMode === "for" ? (
            <View style={{ gap: SPACE.md }}>
              <View className="flex-row items-center justify-between">
                <Text>For</Text>
                <NumberInput
                  label="How long"
                  value={value.durationCount}
                  min={1}
                  max={999}
                  onChange={(durationCount) => onChange({ ...value, durationCount })}
                />
              </View>
              <Segmented
                label="Unit"
                value={value.durationUnit}
                options={UNITS.map((unit) => ({ value: unit, label: unit }))}
                onChange={(durationUnit) => onChange({ ...value, durationUnit })}
              />
            </View>
          ) : (
            <CalendarPanel
              value={value.until || null}
              onSelect={(until) => onChange({ ...value, until })}
            />
          )}
        </>
      )}
      <Button size="lg" label="Done" onPress={() => sheet?.close()} />
    </View>
  );
}

const PRESETS: { label: string; rule: RepeatRule }[] = [
  { label: "Daily", rule: { every: 1, unit: "day" } },
  { label: "Weekly", rule: { every: 1, unit: "week" } },
  { label: "Monthly", rule: { every: 1, unit: "month" } },
];

const same = (a: RepeatRule | null, b: RepeatRule | null) =>
  a === null || b === null ? a === b : a.every === b.every && a.unit === b.unit;

/// "Weekly" for one step of a unit, "Every 3 days" for more, as the desktop says it.
export function repeatLabel(rule: RepeatRule | null): string {
  if (!rule) return "Does not repeat";
  return PRESETS.find((p) => same(p.rule, rule))?.label ?? `Every ${rule.every} ${rule.unit}s`;
}

/// How a task repeats, in its card: the desktop's choices, a rule set elsewhere (the CLI
/// can say every 2 weeks) as its own, and every few days.
export function TaskRepeatPicker({
  value,
  onChange,
}: {
  value: RepeatRule | null;
  onChange: (rule: RepeatRule | null) => void;
}) {
  const sheet = useSheet();
  const [days, setDays] = useState(2);
  const custom = value !== null && !PRESETS.some((p) => same(p.rule, value));
  const entries = [
    ...(custom ? [{ label: repeatLabel(value), rule: value }] : []),
    ...PRESETS,
    { label: "Does not repeat", rule: null },
  ];
  const current = entries.find((e) => same(e.rule, value))?.label ?? null;
  return (
    <View style={{ gap: SPACE.lg }}>
      <OptionList
        label="Repeat"
        value={current}
        options={entries.map((e) => ({ id: e.label, label: e.label }))}
        onChange={(label) => onChange(entries.find((e) => e.label === label)?.rule ?? null)}
      />
      <View style={{ gap: SPACE.md }}>
        <View className="flex-row items-center" style={{ gap: SPACE.md }}>
          <Text tone="muted">Every</Text>
          <NumberInput label="Days" value={days} min={1} max={365} onChange={setDays} />
          <Text tone="muted">{days === 1 ? "day" : "days"}</Text>
        </View>
        <Button
          variant="secondary"
          size="lg"
          label={`Repeat every ${days} ${days === 1 ? "day" : "days"}`}
          onPress={() => {
            onChange({ every: days, unit: "day" });
            sheet?.close();
          }}
        />
      </View>
    </View>
  );
}
