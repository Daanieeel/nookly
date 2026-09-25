import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { listEntities } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { keyKeywords } from "#/lib/entity-key.ts";
import { displayTitle } from "#/lib/entity-title.ts";

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
  /// Restricts the picker to one or more entity `type`s. Omit to allow any type.
  typeFilter?: string | string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <EntityPickerList
          spaceId={spaceId}
          exclude={exclude}
          typeFilter={typeFilter}
          onSelect={(entity) => {
            onSelect(entity);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/// The searchable list itself, for any surface that hosts it (the popover above,
/// a context menu's picker).
export function EntityPickerList({
  spaceId,
  onSelect,
  exclude,
  typeFilter,
}: {
  spaceId: string;
  onSelect: (entity: Entity) => void;
  exclude?: string;
  typeFilter?: string | string[];
}) {
  const { data: allEntities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });
  const allowedTypes = typeFilter
    ? new Set(Array.isArray(typeFilter) ? typeFilter : [typeFilter])
    : null;
  const entities = allowedTypes ? allEntities.filter((e) => allowedTypes.has(e.type)) : allEntities;

  return (
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
              value={`${displayTitle(entity)} ${entity.id}`}
              keywords={keyKeywords(entity.key)}
              onSelect={() => onSelect(entity)}
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
  );
}

/// A picked entity inside a picker trigger, laid out like its row in the list:
/// icon, key, name and type. Shows `placeholder` in placeholder tone until picked.
export function EntityPickerValue({
  entity,
  placeholder,
}: {
  entity: Entity | null;
  placeholder: string;
}) {
  if (!entity) return <span className="text-muted-foreground">{placeholder}</span>;
  return (
    <>
      <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
      <EntityKey entityKey={entity.key} />
      <span className="min-w-0 flex-1 truncate text-left">{displayTitle(entity)}</span>
      <span className="shrink-0 text-xs font-normal text-muted-foreground">{entity.type}</span>
    </>
  );
}
