import { IconX } from "@tabler/icons-react";
import { Popover, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  type ActiveFilter,
  type FilterField,
  FilterValuePopover,
} from "#/components/filter-menu.tsx";

/// The favourite fields of a list page next to its Filter button, one click each to open
/// the field's options: dashed outline and no fill, solid once the field is filtered.
export function QuickFilterBar({
  fields,
  filters,
  onFiltersChange,
  favorites,
  onRemove,
}: {
  fields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  /// The ids of the favourite fields.
  favorites: string[];
  /// Takes a field out of the bar.
  onRemove: (fieldId: string) => void;
}) {
  const shown = favorites.flatMap((id) => {
    const field = fields.find((f) => f.id === id);
    return field && !filters.some((f) => f.fieldId === id) ? [field] : [];
  });
  if (shown.length === 0) return null;

  return (
    <div role="group" aria-label="Quick filters" className="flex flex-wrap items-center gap-1.5">
      {shown.map((field) => (
        <div
          key={field.id}
          className="group/quick flex h-7 items-center rounded-md border-2 border-dashed border-muted-foreground/60 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
        >
          <Popover modal>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-full min-w-0 cursor-pointer items-center gap-1 rounded-md pr-1 pl-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <field.icon size={14} />
                <span className="max-w-40 truncate">{field.label}</span>
              </button>
            </PopoverTrigger>
            <FilterValuePopover
              field={field}
              filter={undefined}
              onChange={(next) => next && onFiltersChange([...filters, next])}
              align="end"
            />
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Remove ${field.label} from Quick Filters`}
                onClick={() => onRemove(field.id)}
                className="mr-0.5 flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none group-focus-within/quick:opacity-100 group-hover/quick:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100"
              >
                <IconX size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Remove from Quick Filters</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
