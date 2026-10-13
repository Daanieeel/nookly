import { useEffect, useState } from "react";
import { Input } from "@nookly/ui/components/input";
import { Textarea } from "@nookly/ui/components/textarea";
import { parseLatexMacros } from "#/lib/latex-macros.ts";
import { SelectField } from "#/components/select-field.tsx";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Switch } from "@nookly/ui/components/switch";
import { Tabs, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import type { SettingId, SettingValue } from "#/lib/settings/registry.ts";
import { useSetting } from "#/lib/settings/settings.ts";

/// Number settings edited as a typed whole number.
type NumberId =
  | "calendar.sessionLengthMinutes"
  | "calendar.calendarEntryLengthMinutes"
  | "calendar.dayStartHour";

/// A whole number in `[min, max]`, saved in multiples of `step`; the buttons move it by
/// `increments`. A number typed on its way to a valid one is only rounded into range
/// as it is saved, so the setting never holds anything else.
export function NumberControl({
  settingId,
  label,
  unit,
  min,
  max,
  step = 1,
  increments = step,
}: {
  settingId: NumberId;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  increments?: number;
}) {
  const [value, setValue] = useSetting(settingId);
  return (
    <div className="flex items-center gap-2">
      <NumberInput
        aria-label={label}
        min={min}
        max={max}
        step={step}
        increments={increments}
        className="w-28"
        value={value}
        onChange={(next) => setValue(Math.round(next / step) * step)}
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

/// The name the Dashboard greets. Typed freely and saved, trimmed, when the field is left.
export function DisplayNameControl() {
  const [saved, setSaved] = useSetting("general.displayName");
  const [draft, setDraft] = useState(saved);
  // A reset or another window changing the name replaces what is typed.
  useEffect(() => setDraft(saved), [saved]);
  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== saved) setSaved(next);
  };
  return (
    <Input
      aria-label="Your name"
      maxLength={40}
      placeholder="Your first name"
      className="w-56"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
    />
  );
}

/// The user's own LaTeX commands, as `\newcommand` definitions. Saved when the field is
/// left; what is wrong shows with its line while typing, and a bad definition never keeps
/// the others from working.
export function LatexMacrosControl() {
  const [saved, setSaved] = useSetting("notes.latexMacros");
  const [draft, setDraft] = useState(saved);
  // A reset or another window changing the macros replaces what is typed.
  useEffect(() => setDraft(saved), [saved]);
  const { errors } = parseLatexMacros(draft);
  const commit = () => {
    if (draft !== saved) setSaved(draft);
  };
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Textarea
        aria-label="LaTeX macros"
        aria-describedby={errors.length > 0 ? "latex-macro-errors" : undefined}
        aria-invalid={errors.length > 0}
        spellCheck={false}
        rows={6}
        placeholder={"\\newcommand{\\N}{\\mathbb{N}}\n\\newcommand{\\abs}[1]{\\left|#1\\right|}"}
        className="min-h-24 resize-y font-mono text-xs"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      {errors.length > 0 && (
        <ul
          id="latex-macro-errors"
          role="alert"
          className="flex flex-col gap-0.5 text-xs text-destructive"
        >
          {errors.map((error) => (
            <li key={`${error.line}-${error.message}`}>
              Line {error.line}: {error.message}
            </li>
          ))}
        </ul>
      )}
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

/// A few choices as segmented tabs, for a setting with two or three values that are worth seeing
/// side by side.
function TabsControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const chosen = options.find((o) => o.value === next);
        if (chosen) onChange(chosen.value);
      }}
    >
      <TabsList aria-label={label} className="w-full">
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value}>
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const TODAY_COLOR_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "neutral", label: "Neutral" },
] satisfies { value: SettingValue<"calendar.todayColor">; label: string }[];

/// The colour that marks the current day in the calendar.
export function TodayColorControl() {
  const [value, setValue] = useSetting("calendar.todayColor");
  return (
    <TabsControl
      label="Current day colour"
      options={TODAY_COLOR_OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

const TODAY_INTENSITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "default", label: "Default" },
  { value: "high", label: "High" },
] satisfies { value: SettingValue<"calendar.todayIntensity">; label: string }[];

/// How strongly the current day is tinted in the calendar.
export function TodayIntensityControl() {
  const [value, setValue] = useSetting("calendar.todayIntensity");
  return (
    <TabsControl
      label="Current day intensity"
      options={TODAY_INTENSITY_OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

/// A plain on or off setting.
export function SwitchControl({
  settingId,
  label,
}: {
  settingId: Extract<
    SettingId,
    "notes.arrowLigatures" | "notes.formatCodeOnPaste" | "notes.vimMode"
  >;
  label: string;
}) {
  const [value, setValue] = useSetting(settingId);
  return <Switch aria-label={label} checked={value} onCheckedChange={setValue} />;
}
