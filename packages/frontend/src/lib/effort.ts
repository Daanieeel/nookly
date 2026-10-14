import type { EffortScale } from "@nookly/shared/effort";
import { create } from "zustand";
import { settings, subscribeSetting } from "#/lib/settings/settings.ts";

export {
  EFFORT_SCALES,
  EFFORT_STEPS,
  type EffortScale,
  type EffortStep,
  effortLabel,
} from "@nookly/shared/effort";

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
