import { accentInsensitiveFilter } from "#/lib/command-filter.ts";
import {
  IconCheck,
  IconFilter,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconStarOff,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Fragment, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { badgeVariants } from "@nookly/ui/components/badge";
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
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { keyKeywords } from "#/lib/entity-key.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";

/// Command menu filters in the style of `docs/skills/data-tables.md` (the
/// tablecn filter menu): one "Filter" button opens a searchable field list,
/// picking a field lists its options, and every applied filter becomes a chip
/// reading `field | operator | values | ×` that can be edited in place.

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /// An entity's `CRS-3` key, shown before the label and matched by search.
  entityKey?: string;
}

/// An option for filtering by an entity (e.g. a Course): its icon, key and title,
/// laid out like its row in the entity picker.
export function entityFilterOption(entity: Entity): FilterOption {
  return {
    value: entity.id,
    label: displayTitle(entity),
    icon: <EntityIcon entity={entity} size={14} />,
    entityKey: entity.key,
  };
}

/// An option's icon, key and label, as every option list shows it.
function OptionContent({ option }: { option: FilterOption }) {
  return (
    <>
      {option.icon}
      {option.entityKey && <EntityKey entityKey={option.entityKey} />}
      <span className="truncate">{option.label}</span>
    </>
  );
}

const optionKeywords = (option: FilterOption) =>
  option.entityKey ? keyKeywords(option.entityKey) : undefined;

export interface FilterField {
  id: string;
  label: string;
  icon: TablerIcon;
  options: FilterOption[];
}

export type FilterOperator = "is" | "isNot";

export type FilterJoin = "and" | "or";

export interface ActiveFilter {
  fieldId: string;
  operator: FilterOperator;
  values: string[];
  /// How the chip connects to the one before it: `"or"` lets an item pass on either of the
  /// two, `"and"` (or none) needs both. Ignored on the first chip.
  join?: FilterJoin;
}

/// The filters as groups of chips joined with "or". An item must pass every group, and
/// one chip of a group is enough: `A, B or C, D` reads `A and (B or C) and D`.
export function filterGroups(filters: ActiveFilter[]): ActiveFilter[][] {
  const groups: ActiveFilter[][] = [];
  for (const filter of filters) {
    const last = groups.at(-1);
    if (last && filter.join === "or") last.push(filter);
    else groups.push([filter]);
  }
  return groups;
}

/// Whether an item passes the filters, `passes` saying whether it passes one of them.
export function matchesFilters(
  filters: ActiveFilter[],
  passes: (filter: ActiveFilter) => boolean,
): boolean {
  return filterGroups(filters).every((group) => group.some(passes));
}

/// Keeps items passing the filters. `valueOf` reads the item's value(s) for a
/// field — an array for a field an item can carry several of at once (e.g. Labels).
export function applyFilters<T>(
  items: T[],
  filters: ActiveFilter[],
  valueOf: (item: T, fieldId: string) => string | string[],
): T[] {
  return items.filter((item) =>
    matchesFilters(filters, (f) => {
      const value = valueOf(item, f.fieldId);
      const matches = Array.isArray(value)
        ? value.some((v) => f.values.includes(v))
        : f.values.includes(value);
      return matches === (f.operator === "is");
    }),
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
  part = "all",
  quickFilters,
  beforeButton,
}: {
  fields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  /// Gives each field in the list, and each chip, a star that adds the field to the page's
  /// quick filters, or takes it out again. Omitted, they have none.
  quickFilters?: { favorites: string[]; onToggle: (fieldId: string) => void };
  /// Shown right before the Filter button, e.g. the page's quick filters.
  beforeButton?: ReactNode;
  /// Called when a popover closes, e.g. to hand focus back to a search input.
  onDone?: () => void;
  /// Renders the Filter button and the chips together, the button's row above the chips, or
  /// only one of them, so a page can place them apart. Render each part once, with the same
  /// props. "Clear filters" always goes with the button.
  part?: "all" | "button" | "chips";
}) {
  const showChips = part !== "button";
  const showButton = part !== "chips";
  // How the filter the placeholder adds connects to the last chip.
  const [nextJoin, setNextJoin] = useState<FilterJoin>("and");

  // Fields that already have a chip are edited through that chip, not re-added.
  // Listed alphabetically, whatever order the page gives its fields in.
  const available = fields
    .filter((f) => !filters.some((a) => a.fieldId === f.id))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  function setJoin(target: ActiveFilter, join: FilterJoin) {
    onFiltersChange(filters.map((f) => (f.fieldId === target.fieldId ? { ...f, join } : f)));
    onDone?.();
  }

  function addValue(target: FilterField, value: string) {
    onFiltersChange([
      ...filters,
      {
        fieldId: target.id,
        operator: "is",
        values: [value],
        ...(filters.length > 0 && nextJoin === "or" && { join: nextJoin }),
      },
    ]);
    setNextJoin("and");
  }

  const clearAll = filters.length > 0 && (
    <Button
      variant="linkMuted"
      size="sm"
      onClick={() => {
        onFiltersChange([]);
        onDone?.();
      }}
    >
      Clear filters
    </Button>
  );

  if (part === "chips" && filters.length === 0) return null;
  const buttonRow = showButton && (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
      {beforeButton}
      {clearAll}
      {available.length > 0 && (
        <AddFilterPopover
          available={available}
          quickFilters={quickFilters}
          onAdd={addValue}
          onDone={onDone}
          toggleWithHotkey
          align="end"
          trigger={
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-1.5">
                    <IconFilter />
                    Filter
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                Filter
                <ShortcutKbd name="filter" />
              </TooltipContent>
            </Tooltip>
          }
        />
      )}
    </div>
  );

  const chipRow = showChips && (
    <div className="flex flex-wrap items-center gap-1.5">
      {filterGroups(filters).map((group, groupIndex) => {
        const chips = group.flatMap((filter, i) => {
          const target = fields.find((f) => f.id === filter.fieldId);
          if (!target) return [];
          return [
            i > 0 && (
              <JoinToggle
                key={`join-${filter.fieldId}`}
                join="or"
                onToggle={() => setJoin(filter, "and")}
              />
            ),
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
              quick={
                quickFilters && {
                  favorite: quickFilters.favorites.includes(target.id),
                  onToggle: () => quickFilters.onToggle(target.id),
                }
              }
            />,
          ];
        });
        const first = group[0];
        return (
          <Fragment key={first?.fieldId}>
            {groupIndex > 0 && first && (
              <JoinToggle join="and" onToggle={() => setJoin(first, "or")} />
            )}
            {group.length > 1 ? (
              <div
                role="group"
                aria-label="Match any of these filters"
                className="flex items-center gap-1 rounded-lg border border-foreground/15 bg-foreground/5 p-0.5"
              >
                {chips}
              </div>
            ) : (
              chips
            )}
          </Fragment>
        );
      })}
      {showChips && filters.length > 0 && available.length > 0 && (
        <>
          <JoinToggle
            join={nextJoin}
            next
            onToggle={() => setNextJoin(nextJoin === "or" ? "and" : "or")}
          />
          <AddFilterPopover
            available={available}
            quickFilters={quickFilters}
            onAdd={addValue}
            onDone={onDone}
            align="start"
            trigger={
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-dotted border-muted-foreground/60 px-2 text-xs text-muted-foreground outline-none hover:border-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconPlus size={14} />
                  Add filter
                </button>
              </PopoverTrigger>
            }
          />
        </>
      )}
    </div>
  );

  if (part === "all") {
    return (
      <div className="flex flex-col gap-1.5">
        {buttonRow}
        {filters.length > 0 && chipRow}
      </div>
    );
  }
  return buttonRow || chipRow;
}

/// A popover that lists the fields still free to filter by, then the chosen field's options,
/// and hands the picked one to `onAdd`. `trigger` holds the `PopoverTrigger`. Modal so its own
/// scroll lock wins over the enclosing dialog's, which otherwise swallows wheel events on this
/// portaled list.
function AddFilterPopover({
  available,
  quickFilters,
  onAdd,
  onDone,
  trigger,
  align,
  toggleWithHotkey,
}: {
  available: FilterField[];
  quickFilters?: { favorites: string[]; onToggle: (fieldId: string) => void };
  onAdd: (field: FilterField, value: string) => void;
  onDone?: () => void;
  trigger: ReactNode;
  align: "start" | "end";
  /// Opens and closes with the Filter shortcut.
  toggleWithHotkey?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const field = available.find((f) => f.id === fieldId);

  useAppHotkey("filter", () => toggleWithHotkey && setOpen((o) => !o));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFieldId(null);
      setSearch("");
    }
  }

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      {trigger}
      <PopoverContent
        className="w-56"
        align={align}
        aria-label="Filter"
        onKeyDown={stopKeys}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onDone?.();
        }}
      >
        <Command loop filter={accentInsensitiveFilter}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={field ? `Filter by ${field.label.toLowerCase()}…` : "Filter by…"}
            onKeyDown={(e) => {
              // Mod+Enter stars the highlighted field instead of picking it.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !field && quickFilters) {
                e.preventDefault();
                const highlighted = e.currentTarget
                  .closest("[cmdk-root]")
                  ?.querySelector("[cmdk-item][data-selected=true]")
                  ?.getAttribute("data-value");
                const target = available.find(
                  (f) => f.label.toLowerCase() === highlighted?.toLowerCase(),
                );
                if (target) quickFilters.onToggle(target.id);
              }
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
                    keywords={optionKeywords(option)}
                    onSelect={() => {
                      onAdd(field, option.value);
                      onOpenChange(false);
                    }}
                  >
                    <OptionContent option={option} />
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
                  {quickFilters && (
                    <QuickFilterStar
                      label={f.label}
                      favorite={quickFilters.favorites.includes(f.id)}
                      onToggle={() => quickFilters.onToggle(f.id)}
                      className="ml-auto size-5 rounded-sm"
                      inList
                    />
                  )}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/// A star that adds a field to the page's quick filters, or takes it out again. Inside the
/// field list (`inList`) it is a mouse-only extra, as a control cannot sit inside an option:
/// Mod+Enter stars the highlighted field there.
function QuickFilterStar({
  label,
  favorite,
  onToggle,
  className,
  inList,
}: {
  label: string;
  favorite: boolean;
  onToggle: () => void;
  className?: string;
  inList?: boolean;
}) {
  const text = favorite ? `Remove ${label} from Quick Filters` : `Add ${label} to Quick Filters`;
  const field = <code className="rounded-sm bg-background/20 px-1 font-mono">{label}</code>;
  const props = {
    "aria-label": text,
    // Keeps the click from picking the field it sits in, or moving the focus off the list.
    onPointerDown: (e: PointerEvent) => e.preventDefault(),
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    className: cn(
      "flex shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground",
      favorite && "text-primary hover:text-primary",
      className,
    ),
    children: !favorite ? (
      <IconStar size={14} />
    ) : inList ? (
      <IconStarFilled size={14} />
    ) : (
      <IconStarOff size={14} />
    ),
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {inList ? (
          <span aria-hidden {...props} />
        ) : (
          <button type="button" aria-pressed={favorite} {...props} />
        )}
      </TooltipTrigger>
      <TooltipContent>
        {favorite ? "Remove " : "Add "}
        {field}
        {favorite ? " from Quick Filters" : " to Quick Filters"}
      </TooltipContent>
    </Tooltip>
  );
}

/// The options of a field with a check each, to pick any number of them. Picked options
/// float to the top for fast deselecting, in the order they were in when the list opened:
/// recomputing it on every toggle would reorder options out from under a user mid-click.
/// `filter` is `undefined` while the field is not filtered; picking the first option sets it,
/// and unpicking the last clears it (`onChange(null)`).
function FilterValueList({
  field,
  filter,
  onChange,
}: {
  field: FilterField;
  filter: ActiveFilter | undefined;
  onChange: (filter: ActiveFilter | null) => void;
}) {
  const [order] = useState(() => {
    const picked = (o: FilterOption) => filter?.values.includes(o.value) ?? false;
    return [...field.options.filter(picked), ...field.options.filter((o) => !picked(o))].map(
      (o) => o.value,
    );
  });
  const orderedOptions = [...field.options].sort(
    (a, b) => order.indexOf(a.value) - order.indexOf(b.value),
  );

  function toggle(value: string) {
    const current = filter?.values ?? [];
    const values = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange(
      values.length > 0 ? { fieldId: field.id, operator: filter?.operator ?? "is", values } : null,
    );
  }

  return (
    <Command loop filter={accentInsensitiveFilter}>
      <CommandInput placeholder={`Search ${field.label.toLowerCase()}…`} />
      <CommandList className="p-1">
        <CommandEmpty>No matches.</CommandEmpty>
        {orderedOptions.map((option) => {
          const checked = filter?.values.includes(option.value) ?? false;
          return (
            <CommandItem
              key={option.value}
              value={option.label}
              keywords={optionKeywords(option)}
              onSelect={() => toggle(option.value)}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input",
                  checked && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {checked && <IconCheck size={12} className="text-primary-foreground" />}
              </span>
              <OptionContent option={option} />
            </CommandItem>
          );
        })}
      </CommandList>
    </Command>
  );
}

/// The popover of `FilterValueList`, as a filter chip and a quick filter both open it.
export function FilterValuePopover({
  field,
  filter,
  onChange,
  onDone,
  align,
}: {
  field: FilterField;
  filter: ActiveFilter | undefined;
  onChange: (filter: ActiveFilter | null) => void;
  onDone?: () => void;
  align?: "start" | "center" | "end";
}) {
  return (
    <PopoverContent
      className="w-56"
      align={align}
      aria-label={`Filter by ${field.label.toLowerCase()}`}
      onKeyDown={stopKeys}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        onDone?.();
      }}
    >
      <FilterValueList field={field} filter={filter} onChange={onChange} />
    </PopoverContent>
  );
}

/// The word between two chips: "and" while both must match, "or" once either will do.
/// One click flips it, and the "or" is a neutral gray badge so a joined pair stands out.
function JoinToggle({
  join,
  next,
  onToggle,
}: {
  join: FilterJoin;
  /// The connector to the filter the placeholder will add, not one between two chips.
  next?: boolean;
  onToggle: () => void;
}) {
  const either = join === "or";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${next ? "Next filter: m" : "M"}atch ${
            either ? "either. Switch to match both" : "both. Switch to match either"
          }`}
          onClick={onToggle}
          className={cn(
            "flex h-5 cursor-pointer items-center rounded-full px-1.5 text-xs leading-none font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            either
              ? badgeVariants({ variant: "neutral", size: "md", className: "rounded-full" })
              : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          {either ? "or" : "and"}
        </button>
      </TooltipTrigger>
      <TooltipContent>{either ? "Switch to and" : "Switch to or"}</TooltipContent>
    </Tooltip>
  );
}

/// Icons a chip shows before the rest collapse into "+N".
const MAX_CHIP_ICONS = 5;

export const CHIP_SEGMENT =
  "flex h-full cursor-pointer items-center justify-center gap-1 bg-foreground/5 px-1.5 text-foreground hover:bg-foreground/10";

function FilterChip({
  field,
  filter,
  onChange,
  onDone,
  quick,
}: {
  field: FilterField;
  filter: ActiveFilter;
  /// `null` removes the filter.
  onChange: (filter: ActiveFilter | null) => void;
  onDone?: () => void;
  quick?: { favorite: boolean; onToggle: () => void };
}) {
  const selected = field.options.filter((o) => filter.values.includes(o.value));
  const single = selected.length === 1 ? selected[0] : undefined;
  // Several options read as a row of their icons when each has one, instead of a count.
  const iconsOnly = selected.length > 1 && selected.every((o) => o.icon);
  const refocus = (e: Event) => {
    e.preventDefault();
    onDone?.();
  };

  return (
    <div className="flex h-7 items-center divide-x divide-border overflow-hidden rounded-md border border-input bg-accent text-xs">
      <span className="flex h-full items-center justify-center gap-1 px-1.5 text-muted-foreground">
        <field.icon size={14} />
        {field.label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={CHIP_SEGMENT}>
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
          <button
            type="button"
            title={selected.map((o) => o.label).join(", ")}
            aria-label={`${field.label}: ${selected.map((o) => o.label).join(", ")}`}
            className={cn(CHIP_SEGMENT, "font-medium")}
          >
            {single ? (
              <>
                {single.icon}
                <span className="max-w-[15ch] truncate">{single.label}</span>
              </>
            ) : iconsOnly ? (
              <span className="flex items-center gap-1">
                {selected.slice(0, MAX_CHIP_ICONS).map((o) => (
                  <span key={o.value} className="flex shrink-0 items-center">
                    {o.icon}
                  </span>
                ))}
                {selected.length > MAX_CHIP_ICONS && (
                  <span className="text-muted-foreground">+{selected.length - MAX_CHIP_ICONS}</span>
                )}
              </span>
            ) : (
              `${selected.length} selected`
            )}
          </button>
        </PopoverTrigger>
        <FilterValuePopover field={field} filter={filter} onChange={onChange} onDone={onDone} />
      </Popover>
      {quick && (
        <QuickFilterStar
          label={field.label}
          favorite={quick.favorite}
          onToggle={() => {
            quick.onToggle();
            onDone?.();
          }}
          className={cn(CHIP_SEGMENT, "px-1")}
        />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Remove Filter"
            onClick={() => {
              onChange(null);
              onDone?.();
            }}
            className={cn(CHIP_SEGMENT, "px-1")}
          >
            <IconX size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove Filter</TooltipContent>
      </Tooltip>
    </div>
  );
}
