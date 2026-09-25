import { IconAdjustmentsHorizontal, IconLayoutKanban, IconList } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Separator } from "@nookly/ui/components/separator";
import { Switch } from "@nookly/ui/components/switch";
import { cn } from "@nookly/ui/lib/utils";
import {
  DISPLAY_PROPERTIES,
  type DisplayOptions,
  GROUPINGS,
  type Layout,
  ORDERINGS,
  validSubGrouping,
} from "./task-model";

const LAYOUT_TILES: { id: Layout; label: string; icon: typeof IconList }[] = [
  { id: "list", label: "List", icon: IconList },
  { id: "board", label: "Board", icon: IconLayoutKanban },
];

/// Linear's "Display" popover: layout tiles, grouping and ordering, empty groups,
/// and which properties rows and cards show.
export function TaskDisplayMenu({
  display,
  onChange,
}: {
  display: DisplayOptions;
  onChange: (display: DisplayOptions) => void;
}) {
  const set = (patch: Partial<DisplayOptions>) => onChange({ ...display, ...patch });
  const groupings = GROUPINGS.filter((g) => display.layout === "list" || g.id !== "none");
  const subGroupings = GROUPINGS.filter((g) => g.id !== display.grouping);
  // Ordering by status inside status groups would change nothing.
  const orderings = ORDERINGS.filter((o) => display.grouping !== "status" || o.id !== "status");

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
              onClick={() => {
                const grouping =
                  tile.id === "board" && display.grouping === "none" ? "status" : display.grouping;
                set({
                  layout: tile.id,
                  grouping,
                  subGrouping: validSubGrouping(grouping, display.subGrouping),
                });
              }}
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
            onValueChange={(v) => {
              const grouping = groupings.find((g) => g.id === v)?.id ?? "status";
              set({
                grouping,
                subGrouping: validSubGrouping(grouping, display.subGrouping),
                ordering:
                  grouping === "status" && display.ordering === "status" ? "due" : display.ordering,
              });
            }}
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

        <OptionRow label="Ordering">
          <Select
            value={display.ordering}
            onValueChange={(v) => set({ ordering: orderings.find((o) => o.id === v)?.id ?? "due" })}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orderings.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>

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

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Display properties</span>
          <div className="flex flex-wrap gap-1.5">
            {DISPLAY_PROPERTIES.map((p) => {
              const on = display.properties.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set({
                      properties: on
                        ? display.properties.filter((id) => id !== p.id)
                        : DISPLAY_PROPERTIES.filter(
                            (d) => d.id === p.id || display.properties.includes(d.id),
                          ).map((d) => d.id),
                    })
                  }
                  className={cn(
                    "h-6 cursor-pointer rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
                    on && "border-foreground/20 bg-accent text-foreground",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
