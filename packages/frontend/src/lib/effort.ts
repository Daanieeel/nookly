import { create } from "zustand";
import { settings, subscribeSetting } from "#/lib/settings/settings.ts";

/// Task effort estimates. One stored value per step (Fibonacci points), shown as
/// T-shirt sizes or points depending on the scale setting, so switching the scale
/// never touches a task.

export type EffortScale = "tshirt" | "fibonacci";

export interface EffortStep {
  /// The stored value.
  value: number;
  tshirt: string;
}

export const EFFORT_STEPS: EffortStep[] = [
  { value: 1, tshirt: "XS" },
  { value: 2, tshirt: "S" },
  { value: 3, tshirt: "M" },
  { value: 5, tshirt: "L" },
  { value: 8, tshirt: "XL" },
  { value: 13, tshirt: "XXL" },
];

export const EFFORT_SCALES: { id: EffortScale; label: string }[] = [
  { id: "tshirt", label: "T-shirt sizes (XS to XXL)" },
  { id: "fibonacci", label: "Points (1, 2, 3, 5, 8, 13)" },
];

export function effortLabel(value: number, scale: EffortScale): string {
  const step = EFFORT_STEPS.find((s) => s.value === value);
  if (!step) return String(value);
  return scale === "tshirt" ? step.tshirt : String(step.value);
}

export interface EffortSettings {
  scale: EffortScale;
}

/// The effort preferences, per device like the date and time ones.
export const useEffortSettings = create<
  EffortSettings & { update: (patch: Partial<EffortSettings>) => void }
>((set) => ({
  scale: settings.get("general.effortScale"),
  update: (patch) => {
    if (patch.scale) settings.set("general.effortScale", patch.scale);
    set(patch);
  },
}));

subscribeSetting("general.effortScale", (scale) => useEffortSettings.setState({ scale }));
