import { IconAdjustmentsHorizontal, IconLayoutKanban, IconList } from "@tabler/icons-react";
import type { ReactNode } from "react";
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
import {
  type DisplayOptions,
  GROUPINGS,
  type Grouping,
  type Layout,
  validSubGrouping,
} from "./assignment-model";

const LAYOUT_TILES: { id: Layout; label: string; icon: typeof IconList }[] = [
  { id: "list", label: "List", icon: IconList },
  { id: "board", label: "Board", icon: IconLayoutKanban },
];

/// The "Display" popover, as on the Tasks page: layout, grouping, sub-grouping
/// and empty groups.
export function AssignmentDisplayMenu({
  display,
  onChange,
}: {
  display: DisplayOptions;
  onChange: (display: DisplayOptions) => void;
}) {
  const set = (patch: Partial<DisplayOptions>) => onChange({ ...display, ...patch });
  const groupings = GROUPINGS.filter((g) => display.layout === "list" || g.id !== "none");
  const subGroupings = GROUPINGS.filter((g) => g.id !== display.grouping);
  const setGrouping = (grouping: Grouping, layout = display.layout) =>
    set({ layout, grouping, subGrouping: validSubGrouping(grouping, display.subGrouping) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <IconAdjustmentsHorizontal />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_TILES.map((tile) => (
            <button
              key={tile.id}
              type="button"
              aria-pressed={display.layout === tile.id}
              onClick={() =>
                setGrouping(
                  // A board opens on status columns, which cards can be dragged
                  // between, unless it already groups by something draggable.
                  tile.id === "board" && display.layout !== "board" && display.grouping !== "course"
                    ? "status"
                    : display.grouping,
                  tile.id,
                )
              }
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                display.layout === tile.id && "border-foreground/20 bg-accent text-foreground",
              )}
            >
              <tile.icon size={16} />
              {tile.label}
            </button>
          ))}
        </div>

        <OptionRow label="Grouping">
          <Select
            value={display.grouping}
            onValueChange={(v) => setGrouping(groupings.find((g) => g.id === v)?.id ?? "deadline")}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupings.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>

        {display.grouping !== "none" && (
          <OptionRow label="Sub-grouping">
            <Select
              value={display.subGrouping}
              onValueChange={(v) =>
                set({ subGrouping: subGroupings.find((g) => g.id === v)?.id ?? "none" })
              }
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {subGroupings.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.id === "none" ? "No sub-grouping" : g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionRow>
        )}

        {display.grouping !== "none" && (
          <OptionRow label="Show empty groups">
            <Switch
              checked={display.showEmpty[display.layout]}
              onCheckedChange={(checked) =>
                set({ showEmpty: { ...display.showEmpty, [display.layout]: checked } })
              }
            />
          </OptionRow>
        )}
      </PopoverContent>
    </Popover>
  );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
