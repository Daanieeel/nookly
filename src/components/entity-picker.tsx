import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listEntities } from "@/lib/api/entities";
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

export function EntityPickerPopover({
  spaceId,
  trigger,
  onSelect,
  exclude,
  typeFilter,
}: {
  spaceId: string;
  trigger: React.ReactNode;
  onSelect: (entity: Entity) => void;
  exclude?: string;
  typeFilter?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: allEntities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
    enabled: open,
  });
  const entities = typeFilter ? allEntities.filter((e) => e.type === typeFilter) : allEntities;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command className="flex flex-col">
          <Command.Input
            placeholder="Search this Space…"
            className="h-9 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>
            {entities
              .filter((e) => e.id !== exclude)
              .map((entity) => (
                <Command.Item
                  key={entity.id}
                  value={displayTitle(entity)}
                  onSelect={() => {
                    onSelect(entity);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{displayTitle(entity)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{entity.type}</span>
                </Command.Item>
              ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
