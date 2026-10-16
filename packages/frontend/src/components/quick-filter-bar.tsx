import { IconX } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import type { ActiveFilter, FilterField } from "#/components/filter-menu.tsx";
import { sameFilter, toggleQuickFilter } from "#/lib/quick-filters.ts";

/// What a quick filter reads as: the option for one value, a count for several, and
/// "Not" in front of an `isNot` filter. `null` while its field or option is not offered.
function describe(favorite: ActiveFilter, field: FilterField | undefined) {
  if (!field) return null;
  const options = field.options.filter((o) => favorite.values.includes(o.value));
  if (options.length === 0) return null;
  const single = options.length === 1 ? options[0] : undefined;
  const text = single ? single.label : `${options.length} ${field.label.toLowerCase()}`;
  return {
    icon: single?.icon ?? <field.icon size={14} />,
    text: favorite.operator === "isNot" ? `Not ${text}` : text,
    title: options.map((o) => o.label).join(", "),
  };
}

/// The favourite filters of a list page, one click each, in the page's action bar: dotted
/// outline and no fill, solid once the filter is on. A click turns the filter on, or off.
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
  favorites: ActiveFilter[];
  /// Takes a favourite out of the bar.
  onRemove: (favorite: ActiveFilter) => void;
}) {
  const shown = favorites.flatMap((favorite) => {
    const description = describe(
      favorite,
      fields.find((f) => f.id === favorite.fieldId),
    );
    return description ? [{ favorite, ...description }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <div role="group" aria-label="Quick filters" className="flex flex-wrap items-center gap-1.5">
      {shown.map(({ favorite, icon, text, title }) => {
        const active = filters.some((f) => sameFilter(f, favorite));
        return (
          <div
            key={`${favorite.fieldId}:${favorite.operator}:${favorite.values.join(",")}`}
            className={cn(
              "group/quick flex h-7 items-center rounded-md border text-xs transition-colors",
              active
                ? "border-solid border-primary text-foreground"
                : "border-dotted border-muted-foreground/60 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              aria-pressed={active}
              title={title}
              onClick={() => onFiltersChange(toggleQuickFilter(filters, favorite))}
              className="flex h-full min-w-0 cursor-pointer items-center gap-1 rounded-md pr-1 pl-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {icon}
              <span className="max-w-40 truncate">{text}</span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Remove Quick Filter ${text}`}
                  onClick={() => onRemove(favorite)}
                  className="mr-0.5 flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none group-focus-within/quick:opacity-100 group-hover/quick:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100"
                >
                  <IconX size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Remove Quick Filter</TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
