import { SelectField } from "#/components/select-field.tsx";
import { EFFORT_SCALES, useEffortSettings } from "#/lib/effort.ts";

/// How task effort is named: T-shirt sizes or points.
export function EffortSettings() {
  const { scale, update } = useEffortSettings();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Task effort</span>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 text-sm">
        <span className="text-muted-foreground">Scale</span>
        <SelectField
          aria-label="Effort scale"
          options={EFFORT_SCALES.map((s) => ({ value: s.id, label: s.label }))}
          value={scale}
          onChange={(value) =>
            update({ scale: EFFORT_SCALES.find((s) => s.id === value)?.id ?? "tshirt" })
          }
        />
      </div>
    </div>
  );
}
