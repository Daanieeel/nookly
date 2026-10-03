import { IconRepeat } from "@tabler/icons-react";
import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import { z } from "zod";
import { CHIP_SEGMENT } from "#/components/filter-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";

export const cadenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
export const durationUnitSchema = z.enum(["days", "weeks", "months", "years"]);
export type Cadence = z.infer<typeof cadenceSchema>;
export type DurationUnit = z.infer<typeof durationUnitSchema>;

export const CADENCE_STEPS = { daily: addDays, weekly: addWeeks, monthly: addMonths };
export const DURATION_UNITS = {
  days: addDays,
  weeks: addWeeks,
  months: addMonths,
  years: addYears,
};

const CADENCE_LABELS = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
} satisfies Record<Cadence, string>;

export interface Repeat {
  cadence: Cadence;
  durationCount: number;
  durationUnit: DurationUnit;
}

/// How a session repeats, as a chip in the same style as the filter bar's:
/// `Repeat | Weekly | for | 4 | months`.
export function RepeatChip({
  value,
  onChange,
}: {
  value: Repeat;
  onChange: (value: Repeat) => void;
}) {
  const repeats = value.cadence !== "none";
  return (
    <div className="flex h-7 w-fit items-center divide-x divide-border overflow-hidden rounded-md border border-input bg-accent text-xs">
      <span className="flex h-full items-center gap-1 px-1.5 text-muted-foreground">
        <IconRepeat size={14} />
        Repeat
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Repeat interval"
            className={cn(CHIP_SEGMENT, "font-medium")}
          >
            {CADENCE_LABELS[value.cadence]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={value.cadence}
            onValueChange={(v) => {
              const cadence = cadenceSchema.safeParse(v);
              if (cadence.success) onChange({ ...value, cadence: cadence.data });
            }}
          >
            {cadenceSchema.options.map((key) => (
              <DropdownMenuRadioItem key={key} value={key}>
                {CADENCE_LABELS[key]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {repeats && (
        <>
          <span className="flex h-full items-center px-1.5 text-muted-foreground">for</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Repeat duration"
                className={cn(CHIP_SEGMENT, "font-medium tabular-nums")}
              >
                {value.durationCount}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <NumberInput
                value={value.durationCount}
                onChange={(durationCount) => onChange({ ...value, durationCount })}
                min={1}
                max={999}
              />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Repeat duration unit"
                className={cn(CHIP_SEGMENT, "font-medium")}
              >
                {value.durationUnit}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={value.durationUnit}
                onValueChange={(v) => {
                  const durationUnit = durationUnitSchema.safeParse(v);
                  if (durationUnit.success) onChange({ ...value, durationUnit: durationUnit.data });
                }}
              >
                {durationUnitSchema.options.map((unit) => (
                  <DropdownMenuRadioItem key={unit} value={unit}>
                    {unit}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
