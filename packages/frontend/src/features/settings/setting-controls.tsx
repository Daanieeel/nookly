import { useState } from "react";
import { SelectField } from "#/components/select-field.tsx";
import { Input } from "@nookly/ui/components/input";
import { Switch } from "@nookly/ui/components/switch";
import type { SettingId, SettingValue } from "#/lib/settings/registry.ts";
import { useSetting } from "#/lib/settings/settings.ts";

/// Number settings edited as a typed whole number.
type NumberId =
  | "calendar.sessionLengthMinutes"
  | "calendar.calendarEntryLengthMinutes"
  | "calendar.dayStartHour";

/// A whole number in `[min, max]`, in steps of `step`. A half typed value is only
/// kept once it is valid, so the setting never holds anything else.
export function NumberControl({
  settingId,
  label,
  unit,
  min,
  max,
  step = 1,
}: {
  settingId: NumberId;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
}) {
  const [value, setValue] = useSetting(settingId);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        className="w-20 tabular-nums"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (
            e.target.value !== "" &&
            Number.isInteger(next) &&
            next >= min &&
            next <= max &&
            next % step === 0
          ) {
            setValue(next);
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

const WEEK_START_OPTIONS = [
  { value: "auto", label: "Automatic" },
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
  { value: "saturday", label: "Saturday" },
] satisfies { value: SettingValue<"calendar.weekStart">; label: string }[];

/// Which day weeks begin on.
export function WeekStartControl() {
  const [value, setValue] = useSetting("calendar.weekStart");
  return (
    <SelectField
      aria-label="First day of the week"
      options={WEEK_START_OPTIONS}
      value={value}
      onChange={(next) =>
        setValue(WEEK_START_OPTIONS.find((o) => o.value === next)?.value ?? "auto")
      }
    />
  );
}

const SNAP_OPTIONS = [5, 10, 15, 30] satisfies SettingValue<"calendar.snapMinutes">[];

/// How finely dragging on the calendar snaps.
export function SnapControl() {
  const [value, setValue] = useSetting("calendar.snapMinutes");
  return (
    <SelectField
      aria-label="Snap to"
      options={SNAP_OPTIONS.map((m) => ({ value: String(m), label: `${m} minutes` }))}
      value={String(value)}
      onChange={(next) => setValue(SNAP_OPTIONS.find((m) => String(m) === next) ?? 15)}
    />
  );
}

/// A plain on or off setting.
export function SwitchControl({
  settingId,
  label,
}: {
  settingId: Extract<SettingId, "notes.arrowLigatures">;
  label: string;
}) {
  const [value, setValue] = useSetting(settingId);
  return <Switch aria-label={label} checked={value} onCheckedChange={setValue} />;
}
