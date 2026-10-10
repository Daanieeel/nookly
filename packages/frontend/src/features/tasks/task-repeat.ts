import type { RepeatRule } from "#/lib/api/types.ts";

/// The most days, weeks or months a rule may skip; the backend refuses more.
export const MAX_REPEAT_EVERY = 365;

export const REPEAT_PRESETS: { label: string; rule: RepeatRule }[] = [
  { label: "Daily", rule: { every: 1, unit: "day" } },
  { label: "Weekly", rule: { every: 1, unit: "week" } },
  { label: "Monthly", rule: { every: 1, unit: "month" } },
];

/// "Weekly" for one step of a unit, "Every 3 days" for more.
export function repeatLabel(rule: RepeatRule): string {
  const preset = REPEAT_PRESETS.find((p) => sameRepeat(p.rule, rule));
  return preset ? preset.label : `Every ${rule.every} ${rule.unit}s`;
}

export function sameRepeat(a: RepeatRule | null, b: RepeatRule | null): boolean {
  return a === null || b === null ? a === b : a.every === b.every && a.unit === b.unit;
}
