import { Command, defaultFilter } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { listEntities } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { dialogPopover } from "#/lib/dialog-popover.ts";
import { keyKeywords } from "#/lib/entity-key.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import { qk } from "#/lib/query-keys.ts";
import { sessionMatches, sessionTime } from "#/lib/session-search.ts";

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
      <PopoverContent {...dialogPopover("w-72 p-0")} align="start">
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
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  const allowedTypes = typeFilter
    ? new Set(Array.isArray(typeFilter) ? typeFilter : [typeFilter])
    : null;
  const entities = allowedTypes ? allEntities.filter((e) => allowedTypes.has(e.type)) : allEntities;
  // A session's title is only its course, so its day and time are what to search by.
  const hasSessions = entities.some((e) => e.type === "session");
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
    enabled: hasSessions,
  });
  const sessionById = new Map(sessions.map((s) => [s.entity.id, s]));
  const [search, setSearch] = useState("");
  // Filtered here, not by the list: a session's day and time may arrive after the user
  // has started typing, and the list would not look again.
  const query = search.trim();
  const shown = entities
    .filter((e) => e.id !== exclude)
    .map((entity) => {
      const session = sessionById.get(entity.id);
      const score = query
        ? Math.max(
            defaultFilter(displayTitle(entity), query, keyKeywords(entity.key)),
            session ? Number(sessionMatches(session, query)) : 0,
          )
        : 1;
      return { entity, session, score };
    })
    .filter((row) => row.score > 0)
    .toSorted((a, b) => b.score - a.score);

  return (
    <Command shouldFilter={false} className="flex flex-col">
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Search this Space…"
        className="h-9 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height,100vh)-3rem))] overflow-y-auto p-1">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          No matches.
        </Command.Empty>
        {shown.map(({ entity, session }) => (
          <Command.Item
            key={entity.id}
            value={entity.id}
            onSelect={() => onSelect(entity)}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
          >
            <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
            <EntityKey entityKey={entity.key} />
            <span className="min-w-0 flex-1 truncate">{displayTitle(entity)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {session ? sessionTime(session) : entity.type}
            </span>
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
