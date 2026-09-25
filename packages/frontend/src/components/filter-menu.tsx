import { IconCheck, IconFilter, IconX, type Icon as TablerIcon } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
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
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// Command menu filters in the style of `docs/skills/data-tables.md` (the
/// tablecn filter menu): one "Filter" button opens a searchable field list,
/// picking a field lists its options, and every applied filter becomes a chip
/// reading `field | operator | values | ×` that can be edited in place.

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface FilterField {
  id: string;
  label: string;
  icon: TablerIcon;
  options: FilterOption[];
}

export type FilterOperator = "is" | "isNot";

export interface ActiveFilter {
  fieldId: string;
  operator: FilterOperator;
  values: string[];
}

/// Keeps items passing every filter. `valueOf` reads the item's value for a field.
export function applyFilters<T>(
  items: T[],
  filters: ActiveFilter[],
  valueOf: (item: T, fieldId: string) => string,
): T[] {
  return items.filter((item) =>
    filters.every((f) => f.values.includes(valueOf(item, f.fieldId)) === (f.operator === "is")),
  );
}

function operatorLabel(operator: FilterOperator, count: number): string {
  if (count > 1) return operator === "is" ? "is any of" : "is none of";
  return operator === "is" ? "is" : "is not";
}

/// Keys handled inside a filter popover must not also reach an enclosing
/// command menu (React bubbles events through portals).
function stopKeys(e: KeyboardEvent) {
  e.stopPropagation();
}

export function FilterMenu({
  fields,
  filters,
  onFiltersChange,
  onDone,
}: {
  fields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  /// Called when a popover closes, e.g. to hand focus back to a search input.
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const field = fields.find((f) => f.id === fieldId);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFieldId(null);
      setSearch("");
    }
  }

  // Fields that already have a chip are edited through that chip, not re-added.
  const available = fields.filter((f) => !filters.some((a) => a.fieldId === f.id));

  function addValue(target: FilterField, value: string) {
    onFiltersChange([...filters, { fieldId: target.id, operator: "is", values: [value] }]);
    onOpenChange(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((filter) => {
        const target = fields.find((f) => f.id === filter.fieldId);
        if (!target) return null;
        return (
          <FilterChip
            key={filter.fieldId}
            field={target}
            filter={filter}
            onChange={(next) =>
              onFiltersChange(
                next
                  ? filters.map((f) => (f.fieldId === filter.fieldId ? next : f))
                  : filters.filter((f) => f.fieldId !== filter.fieldId),
              )
            }
            onDone={onDone}
          />
        );
      })}
      {/* Modal so its own scroll lock wins over the enclosing dialog's, which
          otherwise swallows wheel events on this portaled list. */}
      {available.length > 0 && (
        <Popover modal open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto gap-1.5">
              <IconFilter />
              Filter
              {filters.length === 0 && (
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>⇧</Kbd>
                  <Kbd>F</Kbd>
                </KbdGroup>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-56"
            align="end"
            onKeyDown={stopKeys}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              onDone?.();
            }}
          >
            <Command loop>
              <CommandInput
                value={search}
                onValueChange={setSearch}
                placeholder={field ? `Filter by ${field.label.toLowerCase()}…` : "Filter by…"}
                onKeyDown={(e) => {
                  // Backspace on an empty input steps back to the field list.
                  if (e.key === "Backspace" && search === "" && field) {
                    e.preventDefault();
                    setFieldId(null);
                  }
                }}
              />
              <CommandList className="p-1">
                <CommandEmpty>No matches.</CommandEmpty>
                {field ? (
                  <CommandGroup heading={field.label} className="p-0">
                    {field.options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => addValue(field, option.value)}
                      >
                        {option.icon}
                        <span className="truncate">{option.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  available.map((f) => (
                    <CommandItem
                      key={f.id}
                      value={f.label}
                      onSelect={() => {
                        setFieldId(f.id);
                        setSearch("");
                      }}
                    >
                      <f.icon />
                      <span className="truncate">{f.label}</span>
                    </CommandItem>
                  ))
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

const CHIP_SEGMENT = "flex h-full cursor-pointer items-center gap-1.5 px-2 hover:bg-accent/60";

function FilterChip({
  field,
  filter,
  onChange,
  onDone,
}: {
  field: FilterField;
  filter: ActiveFilter;
  /// `null` removes the filter.
  onChange: (filter: ActiveFilter | null) => void;
  onDone?: () => void;
}) {
  const selected = field.options.filter((o) => filter.values.includes(o.value));
  const single = selected.length === 1 ? selected[0] : undefined;
  const refocus = (e: Event) => {
    e.preventDefault();
    onDone?.();
  };

  function toggle(value: string) {
    const values = filter.values.includes(value)
      ? filter.values.filter((v) => v !== value)
      : [...filter.values, value];
    onChange(values.length > 0 ? { ...filter, values } : null);
  }

  return (
    <div className="flex h-8 items-center divide-x divide-border overflow-hidden rounded-md border border-input bg-accent text-xs">
      <span className="flex h-full items-center gap-1.5 px-2 text-muted-foreground">
        <field.icon size={14} />
        {field.label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(CHIP_SEGMENT, "text-muted-foreground")}>
            {operatorLabel(filter.operator, filter.values.length)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onKeyDown={stopKeys} onCloseAutoFocus={refocus}>
          <DropdownMenuRadioGroup
            value={filter.operator}
            onValueChange={(v) => onChange({ ...filter, operator: v === "isNot" ? "isNot" : "is" })}
          >
            <DropdownMenuRadioItem value="is">
              {operatorLabel("is", filter.values.length)}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="isNot">
              {operatorLabel("isNot", filter.values.length)}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover modal>
        <PopoverTrigger asChild>
          <button type="button" className={cn(CHIP_SEGMENT, "font-medium")}>
            {single ? (
              <>
                {single.icon}
                <span className="max-w-32 truncate">{single.label}</span>
              </>
            ) : (
              `${selected.length} selected`
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56" onKeyDown={stopKeys} onCloseAutoFocus={refocus}>
          <Command loop>
            <CommandInput placeholder={`Search ${field.label.toLowerCase()}…`} />
            <CommandList className="p-1">
              <CommandEmpty>No matches.</CommandEmpty>
              {field.options.map((option) => {
                const checked = filter.values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-input",
                        checked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked && <IconCheck size={12} className="text-primary-foreground" />}
                    </span>
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Remove Filter"
            onClick={() => {
              onChange(null);
              onDone?.();
            }}
            className={cn(CHIP_SEGMENT, "px-1.5 text-muted-foreground")}
          >
            <IconX size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove Filter</TooltipContent>
      </Tooltip>
    </div>
  );
}
