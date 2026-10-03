import {
  IconAdjustmentsHorizontal,
  IconLayoutGrid,
  IconLayoutKanban,
  IconList,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Switch } from "@nookly/ui/components/switch";
import { cn } from "@nookly/ui/lib/utils";
import type { CardDisplayBase } from "#/lib/display-options.ts";

/// Shared pieces of the "Display" popovers on Tasks, Assignments, Bookmarks and Files.

export function DisplayPopover({
  variant,
  wide = false,
  children,
}: {
  variant: "ghost" | "secondary";
  /// The roomier panel for menus with more options.
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={variant} size="sm" className="gap-1.5">
          <IconAdjustmentsHorizontal />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={wide ? "flex w-96 flex-col gap-3 p-3" : "flex w-80 flex-col gap-3 p-3"}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function LayoutTiles<T extends string>({
  tiles,
  value,
  onSelect,
}: {
  tiles: { id: T; label: string; icon: ComponentType<{ size?: number }> }[];
  value: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          aria-pressed={value === tile.id}
          onClick={() => onSelect(tile.id)}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
            value === tile.id && "border-foreground/20 bg-accent text-foreground",
          )}
        >
          <tile.icon size={16} />
          {tile.label}
        </button>
      ))}
    </div>
  );
}

export function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/// A labelled row holding a small select. An unknown value falls back to `fallback`.
export function SelectRow<T extends string>({
  label,
  value,
  options,
  fallback,
  wide = false,
  onChange,
  optionLabel,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; icon?: ComponentType }[];
  fallback: T;
  /// The wider trigger used beside icons.
  wide?: boolean;
  onChange: (id: T) => void;
  optionLabel?: (option: { id: T; label: string }) => string;
}) {
  return (
    <OptionRow label={label}>
      <Select
        value={value}
        onValueChange={(v) => onChange(options.find((o) => o.id === v)?.id ?? fallback)}
      >
        <SelectTrigger size="sm" className={wide ? "w-44" : "w-36"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.icon && <o.icon />}
              {optionLabel ? optionLabel(o) : o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </OptionRow>
  );
}

interface BoardDisplay {
  layout: "list" | "board";
  grouping: string;
  showEmpty: Record<"list" | "board", boolean>;
  hiddenColumns: string[];
}

/// The "Show empty groups" switch, remembered per layout.
export function ShowEmptyRow({
  display,
  set,
}: {
  display: BoardDisplay;
  set: (patch: { showEmpty: Record<"list" | "board", boolean> }) => void;
}) {
  if (display.grouping === "none") return null;
  return (
    <OptionRow label="Show empty groups">
      <Switch
        checked={display.showEmpty[display.layout]}
        onCheckedChange={(checked) =>
          set({ showEmpty: { ...display.showEmpty, [display.layout]: checked } })
        }
      />
    </OptionRow>
  );
}

/// One switch per board column, so any of them can be hidden or brought back.
export function ColumnToggles({
  display,
  columns,
  set,
}: {
  display: BoardDisplay;
  columns: { id: string; name: string }[];
  set: (patch: { hiddenColumns: string[] }) => void;
}) {
  if (display.layout !== "board" || columns.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Columns</span>
      {columns.map((column) => (
        <OptionRow key={column.id} label={column.name}>
          <Switch
            aria-label={`Show ${column.name} column`}
            checked={!display.hiddenColumns.includes(column.id)}
            onCheckedChange={(checked) =>
              set({
                hiddenColumns: checked
                  ? display.hiddenColumns.filter((id) => id !== column.id)
                  : [...display.hiddenColumns, column.id],
              })
            }
          />
        </OptionRow>
      ))}
    </div>
  );
}

/// The Grid and List layout tiles of the card and row pages (Bookmarks, Files).
const GRID_LIST_TILES: {
  id: "grid" | "list";
  label: string;
  icon: ComponentType<{ size?: number }>;
}[] = [
  { id: "grid", label: "Grid", icon: IconLayoutGrid },
  { id: "list", label: "List", icon: IconList },
];

/// The "Display" popover of the card and row pages (Bookmarks, Files): layout, grouping
/// and ordering, plus whatever page specific rows go in `children`.
export function CardDisplayMenu<
  G extends string,
  O extends string,
  D extends CardDisplayBase<G, O>,
>({
  display,
  onChange,
  groupings,
  orderings,
  children,
}: {
  display: D;
  onChange: (display: D) => void;
  groupings: { id: G; label: string }[];
  orderings: { id: O; label: string }[];
  children?: ReactNode;
}) {
  return (
    <DisplayPopover variant="ghost">
      <LayoutTiles
        tiles={GRID_LIST_TILES}
        value={display.layout}
        onSelect={(layout) => onChange({ ...display, layout })}
      />
      <SelectRow
        label="Grouping"
        value={display.grouping}
        options={groupings}
        fallback={display.grouping}
        onChange={(grouping) => onChange({ ...display, grouping })}
      />
      <SelectRow
        label="Ordering"
        value={display.ordering}
        options={orderings}
        fallback={display.ordering}
        onChange={(ordering) => onChange({ ...display, ordering })}
      />
      {children}
    </DisplayPopover>
  );
}

/// The List and Board layout tiles of the board pages (Tasks, Assignments).
export const LIST_BOARD_TILES: {
  id: "list" | "board";
  label: string;
  icon: ComponentType<{ size?: number }>;
}[] = [
  { id: "list", label: "List", icon: IconList },
  { id: "board", label: "Board", icon: IconLayoutKanban },
];

/// The sub-grouping select of the board pages, hidden without a grouping.
export function SubGroupingRow<G extends string>({
  display,
  options,
  set,
}: {
  display: { grouping: G; subGrouping: G };
  options: { id: G; label: string }[];
  set: (patch: { subGrouping: G }) => void;
}) {
  if (display.grouping === "none") return null;
  return (
    <SelectRow
      label="Sub-grouping"
      value={display.subGrouping}
      options={options}
      fallback={display.subGrouping}
      wide
      onChange={(subGrouping) => set({ subGrouping })}
      optionLabel={(g) => (g.id === "none" ? "No sub-grouping" : g.label)}
    />
  );
}

/// What the board pages' "Display" popovers end with: the ordering select, empty groups
/// and board columns.
export function BoardOrderingRows<O extends string>({
  display,
  orderings,
  fallback,
  columns,
  set,
}: {
  display: BoardDisplay & { ordering: O };
  orderings: { id: O; label: string }[];
  /// The ordering an unknown value falls back to.
  fallback: O;
  columns: { id: string; name: string }[];
  set: (patch: {
    ordering?: O;
    showEmpty?: Record<"list" | "board", boolean>;
    hiddenColumns?: string[];
  }) => void;
}) {
  return (
    <>
      <SelectRow
        label="Ordering"
        value={display.ordering}
        options={orderings}
        fallback={fallback}
        wide
        onChange={(ordering) => set({ ordering })}
      />
      <ShowEmptyRow display={display} set={set} />
      <ColumnToggles display={display} columns={columns} set={set} />
    </>
  );
}

/// The grouping choices of a board page's menu: a list can go without grouping, a board
/// can't, and a sub-grouping can't repeat the grouping.
export function boardGroupings<G extends string>(
  available: { id: G; label: string }[],
  display: { layout: "list" | "board"; grouping: G },
) {
  return {
    groupings: available.filter((g) => display.layout === "list" || g.id !== "none"),
    subGroupings: available.filter((g) => g.id !== display.grouping),
  };
}

/// What a board page's "Display" popover (Tasks, Assignments) is given.
export interface BoardMenuProps<D> {
  display: D;
  onChange: (display: D) => void;
  /// Every board column, so any of them can be hidden or brought back.
  columns: { id: string; name: string }[];
  /// The cross-Space overview groups by Space; a Space's own page can't.
  crossSpace?: boolean;
}
