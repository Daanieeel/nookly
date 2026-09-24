import { IconAdjustmentsHorizontal, IconLayoutGrid, IconList } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type DisplayOptions, GROUPINGS, type Layout, ORDERINGS } from "./bookmark-model";

const LAYOUT_TILES: { id: Layout; label: string; icon: typeof IconList }[] = [
  { id: "grid", label: "Grid", icon: IconLayoutGrid },
  { id: "list", label: "List", icon: IconList },
];

/// The "Display" popover, as on Tasks and Assignments: layout, grouping,
/// ordering and what each card shows.
export function BookmarkDisplayMenu({
  display,
  onChange,
}: {
  display: DisplayOptions;
  onChange: (display: DisplayOptions) => void;
}) {
  const set = (patch: Partial<DisplayOptions>) => onChange({ ...display, ...patch });

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
              onClick={() => set({ layout: tile.id })}
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
            onValueChange={(v) =>
              set({ grouping: GROUPINGS.find((g) => g.id === v)?.id ?? "none" })
            }
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUPINGS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>

        <OptionRow label="Ordering">
          <Select
            value={display.ordering}
            onValueChange={(v) =>
              set({ ordering: ORDERINGS.find((o) => o.id === v)?.id ?? "newest" })
            }
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDERINGS.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>

        {display.layout === "grid" && (
          <OptionRow label="Preview images">
            <Switch
              checked={display.showPreviews}
              onCheckedChange={(showPreviews) => set({ showPreviews })}
            />
          </OptionRow>
        )}
        <OptionRow label="Descriptions">
          <Switch
            checked={display.showDescriptions}
            onCheckedChange={(showDescriptions) => set({ showDescriptions })}
          />
        </OptionRow>
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
