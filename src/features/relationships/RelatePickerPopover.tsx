import { Command } from "cmdk";
import { IconChevronLeft } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listEntities } from "@/lib/api/entities";
import type { Entity, RelationshipTypeInfo } from "@/lib/api/types";
import { keyKeywords } from "@/lib/entity-key";
import { displayTitle } from "@/lib/entity-title";

/// Two steps in one popover: pick the relationship type, then the target entity.
/// Backspace on an empty search goes back to the type step.
export function RelatePickerPopover({
  spaceId,
  exclude,
  types,
  trigger,
  onSelect,
}: {
  spaceId: string;
  exclude: string;
  types: RelationshipTypeInfo[];
  trigger: React.ReactNode;
  onSelect: (target: Entity, relationshipType: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
    enabled: open,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  // The list remounts per step, so hand focus back to the search each time.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, type]);

  const pickType = (name: string | null) => {
    setType(name);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) pickType(null);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command key={type ?? "type"} className="flex flex-col">
          <div className="flex items-center border-b border-border">
            {type && (
              <button
                type="button"
                onClick={() => pickType(null)}
                className="ml-1.5 flex shrink-0 items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              >
                <IconChevronLeft size={12} />
                {type}
              </button>
            )}
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && type && search === "") pickType(null);
              }}
              placeholder={type ? "Search this Space…" : "Choose how they relate…"}
              className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>
            {type === null
              ? types.map((t) => (
                  <Command.Item
                    key={t.name}
                    value={t.name}
                    onSelect={() => pickType(t.name)}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.inverseLabel}</span>
                  </Command.Item>
                ))
              : entities
                  .filter((e) => e.id !== exclude)
                  .map((entity) => (
                    <Command.Item
                      key={entity.id}
                      value={`${displayTitle(entity)} ${entity.id}`}
                      keywords={keyKeywords(entity.key)}
                      onSelect={() => {
                        onSelect(entity, type);
                        setOpen(false);
                        pickType(null);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                    >
                      <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
                      <EntityKey entityKey={entity.key} />
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
