import { IconRepeat } from "@tabler/icons-react";
import { useState } from "react";
import { z } from "zod";
import { Calendar } from "#/components/date-input.tsx";
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
import { formatShortDate } from "#/lib/datetime.ts";
import { cn } from "@nookly/ui/lib/utils";

export const cadenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
export const durationUnitSchema = z.enum(["days", "weeks", "months", "years"]);
export const endModeSchema = z.enum(["for", "until"]);
export type Cadence = z.infer<typeof cadenceSchema>;
export type DurationUnit = z.infer<typeof durationUnitSchema>;

const CADENCE_LABELS = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
} satisfies Record<Cadence, string>;

export type EndMode = z.infer<typeof endModeSchema>;

export interface Repeat {
  cadence: Cadence;
  /// "for" runs the series for a duration, "until" up to and including a day.
  endMode: EndMode;
  durationCount: number;
  durationUnit: DurationUnit;
  /// `YYYY-MM-DD`, or empty until one is picked. Only read when `endMode` is "until".
  until: string;
}

/// How an item repeats, as a chip in the same style as the filter bar's:
/// `Repeat | Weekly | for | 4 | months`, or `Repeat | Weekly | until | Mar 20`.
export function RepeatChip({
  value,
  onChange,
}: {
  value: Repeat;
  onChange: (value: Repeat) => void;
}) {
  const repeats = value.cadence !== "none";
  const [untilOpen, setUntilOpen] = useState(false);
  return (
    <div className="flex h-8 w-full items-center divide-x divide-border overflow-hidden rounded-md border border-input bg-accent text-sm">
      <span className="flex h-full items-center justify-center gap-1 px-1.5 text-muted-foreground">
        <IconRepeat size={16} />
        Repeat
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Repeat interval"
            className={cn(CHIP_SEGMENT, "flex-1 font-medium")}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Repeat end type"
                className={cn(CHIP_SEGMENT, "px-2.5 text-muted-foreground")}
              >
                {value.endMode}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={value.endMode}
                onValueChange={(v) => {
                  const endMode = endModeSchema.safeParse(v);
                  if (endMode.success) onChange({ ...value, endMode: endMode.data });
                }}
              >
                {endModeSchema.options.map((mode) => (
                  <DropdownMenuRadioItem key={mode} value={mode}>
                    {mode}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {value.endMode === "until" ? (
            <Popover open={untilOpen} onOpenChange={setUntilOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Repeat until date"
                  className={cn(CHIP_SEGMENT, "flex-1 font-medium")}
                >
                  {value.until ? formatShortDate(value.until) : "Pick a date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <Calendar
                  value={value.until || null}
                  onSelect={(until) => {
                    setUntilOpen(false);
                    onChange({ ...value, until });
                  }}
                />
              </PopoverContent>
            </Popover>
          ) : (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Repeat duration"
                    className={cn(CHIP_SEGMENT, "flex-1 font-medium tabular-nums")}
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
                    className={cn(CHIP_SEGMENT, "flex-1 font-medium")}
                  >
                    {value.durationUnit}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={value.durationUnit}
                    onValueChange={(v) => {
                      const durationUnit = durationUnitSchema.safeParse(v);
                      if (durationUnit.success)
                        onChange({ ...value, durationUnit: durationUnit.data });
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
        </>
      )}
    </div>
  );
}
