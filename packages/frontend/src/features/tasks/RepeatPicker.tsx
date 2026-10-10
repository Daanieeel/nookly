import { IconCheck, IconRepeat, IconRepeatOff } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Command, CommandItem, CommandList } from "@nookly/ui/components/command";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import type { RepeatRule } from "#/lib/api/types.ts";
import { dialogPopover } from "#/lib/dialog-popover.ts";
import { MAX_REPEAT_EVERY, REPEAT_PRESETS, repeatLabel, sameRepeat } from "./task-repeat.ts";

/// Picks how often a task repeats: daily, weekly, monthly, every N days, or not at all.
/// A rule set elsewhere (the CLI can say "every 2 weeks") shows as its own entry.
export function RepeatPicker({
  value,
  onSelect,
  align = "start",
  children,
}: {
  value: RepeatRule | null;
  onSelect: (rule: RepeatRule | null) => void;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(2);

  function choose(rule: RepeatRule | null) {
    setOpen(false);
    if (!sameRepeat(rule, value)) onSelect(rule);
  }

  const isPreset = value !== null && REPEAT_PRESETS.some((p) => sameRepeat(p.rule, value));
  const entries = [
    ...(value !== null && !isPreset ? [{ label: repeatLabel(value), rule: value }] : []),
    ...REPEAT_PRESETS,
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent {...dialogPopover("w-60 p-0")} align={align} aria-label="Repeat">
        <Command loop>
          <CommandList className="p-1">
            {entries.map((entry) => (
              <CommandItem
                key={entry.label}
                value={entry.label}
                onSelect={() => choose(entry.rule)}
              >
                <IconRepeat size={14} />
                {entry.label}
                {sameRepeat(entry.rule, value) && <IconCheck size={14} className="ml-auto" />}
              </CommandItem>
            ))}
            {/* Always there, so the list does not change height: disabled with nothing to remove. */}
            <CommandItem
              value="Does not repeat"
              disabled={value === null}
              onSelect={() => choose(null)}
            >
              <IconRepeatOff size={14} />
              Does not repeat
            </CommandItem>
          </CommandList>
        </Command>
        <div className="flex items-center gap-2 border-t border-border p-2">
          <span className="text-xs text-muted-foreground">Every</span>
          <NumberInput
            value={days}
            onChange={setDays}
            min={1}
            max={MAX_REPEAT_EVERY}
            aria-label="days"
            className="w-28"
          />
          <span className="text-xs text-muted-foreground">days</span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto h-7"
            aria-label={`Repeat every ${days} ${days === 1 ? "day" : "days"}`}
            onClick={() => choose({ every: days, unit: "day" })}
          >
            Set
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
