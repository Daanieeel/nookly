import { SelectField } from "#/components/select-field.tsx";
import { EFFORT_SCALES, useEffortSettings } from "#/lib/effort.ts";

/// How task effort is named: T-shirt sizes or points.
export function EffortSettings() {
  const { scale, update } = useEffortSettings();
  return (
    <SelectField
      aria-label="Effort scale"
      options={EFFORT_SCALES.map((s) => ({ value: s.id, label: s.label }))}
      value={scale}
      onChange={(value) =>
        update({ scale: EFFORT_SCALES.find((s) => s.id === value)?.id ?? "tshirt" })
      }
    />
  );
}
