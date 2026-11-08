import { IconFilterPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nookly/ui/components/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { CHIP_SEGMENT } from "#/components/filter-menu.tsx";
import { Calendar } from "#/components/date-input.tsx";
import { toDay } from "#/features/tasks/task-model.ts";
import { accentInsensitiveFilter } from "#/lib/command-filter.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { operatorsFor } from "./conditions.ts";
import type { ConditionOperator, FieldKind, ViewCondition } from "./types.ts";

/// The richer filters of a view as chips, `Due date | is before | Nov 12 | ×`, and the
/// button that adds one: pick a field, then how to compare it.

/// What the bar needs to know of a field.
export interface ConditionFieldInfo {
  id: string;
  label: string;
  kind: FieldKind;
}

const OPERATOR_LABELS = {
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  contains: "contains",
  notContains: "does not contain",
  before: "is before",
  after: "is after",
  between: "is between",
  eq: "is",
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
} satisfies Record<ConditionOperator, string>;

const WEEK = 7 * 24 * 60 * 60 * 1000;

/// The values a condition starts with, so it is complete from the first moment.
function startingValues(operator: ConditionOperator, previous: string[]): string[] {
  const today = toDay(new Date());
  switch (operator) {
    case "isEmpty":
    case "isNotEmpty":
      return [];
    case "before":
    case "after":
      return [previous[0] ?? today];
    case "between":
      return [previous[0] ?? today, previous[1] ?? toDay(new Date(Date.now() + WEEK))];
    case "contains":
    case "notContains":
      return [previous[0] ?? ""];
    default:
      return [previous[0] && Number.isFinite(Number(previous[0])) ? previous[0] : "0"];
  }
}

/// Whether two operators take the same kind of values, so switching keeps them.
const sameValues = (a: ConditionOperator, b: ConditionOperator) =>
  operatorsFor("date").includes(a) === operatorsFor("date").includes(b) &&
  operatorsFor("number").includes(a) === operatorsFor("number").includes(b);

export function newCondition(
  field: ConditionFieldInfo,
  operator: ConditionOperator,
): ViewCondition {
  return { fieldId: field.id, operator, values: startingValues(operator, []) };
}

export function AddConditionButton({
  fields,
  onAdd,
}: {
  fields: ConditionFieldInfo[];
  onAdd: (condition: ViewCondition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const field = fields.find((f) => f.id === fieldId);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setFieldId(null);
  };
  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Add Condition">
              <IconFilterPlus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Add Condition</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-56" align="end" aria-label="Add Condition">
        <Command loop filter={accentInsensitiveFilter}>
          <CommandInput placeholder={field ? `${field.label}…` : "Condition on…"} />
          <CommandList className="p-1">
            <CommandEmpty>No matches.</CommandEmpty>
            {field ? (
              <CommandGroup heading={field.label} className="p-0">
                {operatorsFor(field.kind).map((operator) => (
                  <CommandItem
                    key={operator}
                    value={OPERATOR_LABELS[operator]}
                    onSelect={() => {
                      onAdd(newCondition(field, operator));
                      onOpenChange(false);
                    }}
                  >
                    {OPERATOR_LABELS[operator]}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              fields.map((f) => (
                <CommandItem key={f.id} value={f.label} onSelect={() => setFieldId(f.id)}>
                  <span className="truncate">{f.label}</span>
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DayValue({
  label,
  day,
  onChange,
}: {
  label: string;
  day: string;
  onChange: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={cn(CHIP_SEGMENT, "font-medium")}>
          {formatShortDate(day)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3" aria-label={label}>
        <Calendar
          value={day}
          compact
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ConditionChip({
  field,
  condition,
  onChange,
}: {
  field: ConditionFieldInfo;
  condition: ViewCondition;
  /// `null` removes the condition.
  onChange: (condition: ViewCondition | null) => void;
}) {
  const setValue = (index: number, value: string) => {
    const values = [...condition.values];
    values[index] = value;
    onChange({ ...condition, values });
  };
  const { operator, values } = condition;
  const isDate = operatorsFor("date").includes(operator) && field.kind === "date";
  const takesText = operator !== "isEmpty" && operator !== "isNotEmpty" && !isDate;

  return (
    <div className="flex h-7 items-center divide-x divide-border overflow-hidden rounded-md border border-input bg-accent text-xs">
      <span className="flex h-full items-center px-1.5 text-muted-foreground">{field.label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={CHIP_SEGMENT}>
            {OPERATOR_LABELS[operator]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={operator}
            onValueChange={(v) => {
              const next = operatorsFor(field.kind).find((o) => o === v);
              if (!next) return;
              onChange({
                ...condition,
                operator: next,
                values: startingValues(next, sameValues(next, operator) ? values : []),
              });
            }}
          >
            {operatorsFor(field.kind).map((o) => (
              <DropdownMenuRadioItem key={o} value={o}>
                {OPERATOR_LABELS[o]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {isDate && operator !== "isEmpty" && operator !== "isNotEmpty" && (
        <>
          <DayValue
            label={operator === "between" ? `${field.label} from` : field.label}
            day={values[0] ?? toDay(new Date())}
            onChange={(day) => setValue(0, day)}
          />
          {operator === "between" && (
            <DayValue
              label={`${field.label} until`}
              day={values[1] ?? toDay(new Date())}
              onChange={(day) => setValue(1, day)}
            />
          )}
        </>
      )}
      {takesText && (
        <input
          aria-label={`${field.label} ${OPERATOR_LABELS[operator]}`}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          value={values[0] ?? ""}
          placeholder={field.kind === "number" ? "0" : "Text"}
          onChange={(e) => setValue(0, e.target.value)}
          className="h-full w-24 bg-foreground/5 px-1.5 font-medium text-foreground outline-none placeholder:text-muted-foreground focus-visible:bg-foreground/10"
        />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Remove Condition"
            onClick={() => onChange(null)}
            className={cn(CHIP_SEGMENT, "px-1")}
          >
            <IconX size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove Condition</TooltipContent>
      </Tooltip>
    </div>
  );
}

/// The conditions as chips. Renders nothing without any.
export function ConditionChips({
  fields,
  conditions,
  onChange,
}: {
  fields: ConditionFieldInfo[];
  conditions: ViewCondition[];
  onChange: (conditions: ViewCondition[]) => void;
}) {
  if (conditions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conditions.map((condition, index) => {
        const field = fields.find((f) => f.id === condition.fieldId);
        if (!field) return null;
        return (
          <ConditionChip
            // A field can hold several conditions, so the position tells them apart.
            // oxlint-disable-next-line react/no-array-index-key
            key={`${condition.fieldId}-${index}`}
            field={field}
            condition={condition}
            onChange={(next) =>
              onChange(
                next
                  ? conditions.map((c, i) => (i === index ? next : c))
                  : conditions.filter((_, i) => i !== index),
              )
            }
          />
        );
      })}
    </div>
  );
}
