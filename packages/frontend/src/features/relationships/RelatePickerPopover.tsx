import { dialogPopover } from "#/lib/dialog-popover.ts";
import { qk } from "#/lib/query-keys.ts";
import { Command } from "cmdk";
import { IconChevronLeft } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { listEntities } from "#/lib/api/entities.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import type { Entity, RelationshipTypeInfo } from "#/lib/api/types.ts";
import { formatClock, formatShortDate } from "#/lib/datetime.ts";
import { keyKeywords } from "#/lib/entity-key.ts";
import { displayTitle } from "#/lib/entity-title.ts";

/// One way to link: a relationship type read from this item's side. `reverse`
/// means this item is the type's `to` end, so the new link points at it.
export interface RelateOption {
  key: string;
  type: string;
  reverse: boolean;
  label: string;
  description: string;
  /// The entity type the other end has to be, `null` for any.
  targetType: string | null;
}

/// Links that read the same from both ends, so they get no second "reverse" entry.
const SYMMETRIC_TYPES = new Set(["relates-to"]);

/// Every way an item of `entityType` can be linked, with the target type each
/// way allows: "Session of course" only for sessions, and only toward courses.
export function relateOptions(types: RelationshipTypeInfo[], entityType: string): RelateOption[] {
  return types.flatMap((t) => {
    const options: RelateOption[] = [];
    if (t.fromType === null || t.fromType === entityType) {
      options.push({
        key: `${t.name}:forward`,
        type: t.name,
        reverse: false,
        label: t.label,
        description: t.description,
        targetType: t.toType,
      });
    }
    const typed = t.fromType !== null || t.toType !== null;
    const reverseFits = typed ? t.toType === entityType : !SYMMETRIC_TYPES.has(t.name);
    if (reverseFits) {
      options.push({
        key: `${t.name}:reverse`,
        type: t.name,
        reverse: true,
        label: t.inverseLabel.charAt(0).toUpperCase() + t.inverseLabel.slice(1),
        description: t.description,
        targetType: t.fromType,
      });
    }
    return options;
  });
}

function typeName(entityType: string): string {
  return entityType.replace(/_/g, " ");
}

/// Two steps in one popover: pick the relationship type, then the target entity.
/// Backspace on an empty search goes back to the type step.
export function RelatePickerPopover({
  spaceId,
  exclude,
  entityType,
  types,
  trigger,
  onSelect,
}: {
  spaceId: string;
  exclude: string;
  entityType: string;
  types: RelationshipTypeInfo[];
  trigger: React.ReactNode;
  onSelect: (target: Entity, relationshipType: string, reverse: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent {...dialogPopover("w-72 p-0")} align="start">
        <RelatePicker
          spaceId={spaceId}
          exclude={exclude}
          entityType={entityType}
          types={types}
          onSelect={(target, relationshipType, reverse) => {
            onSelect(target, relationshipType, reverse);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/// The picker itself, for any surface that hosts it (the popover above, the
/// context menu's Relate to...). Starts over at the type step on every mount.
export function RelatePicker({
  spaceId,
  exclude,
  entityType,
  types,
  onSelect,
}: {
  spaceId: string;
  exclude: string;
  entityType: string;
  types: RelationshipTypeInfo[];
  onSelect: (target: Entity, relationshipType: string, reverse: boolean) => void;
}) {
  const [option, setOption] = useState<RelateOption | null>(null);
  const options = relateOptions(types, entityType);
  const [search, setSearch] = useState("");
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  // A session's title is just its course, so its date and time tell them apart.
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
    enabled: option?.targetType === "session",
  });
  const sessionById = new Map(sessions.map((s) => [s.entity.id, s]));

  const inputRef = useRef<HTMLInputElement>(null);
  // The list remounts per step, so hand focus back to the search each time.
  useEffect(() => {
    inputRef.current?.focus();
  }, [option]);

  const pickOption = (next: RelateOption | null) => {
    setOption(next);
    setSearch("");
  };

  const targets = entities
    .filter((e) => e.id !== exclude && (!option?.targetType || e.type === option.targetType))
    .map((entity) => {
      const session = sessionById.get(entity.id);
      return { entity, session };
    })
    .sort((a, b) =>
      a.session && b.session
        ? `${b.session.date} ${b.session.startTime}`.localeCompare(
            `${a.session.date} ${a.session.startTime}`,
          )
        : 0,
    );

  return (
    <Command key={option?.key ?? "type"} className="flex flex-col">
      <div className="flex items-center border-b border-border">
        {option && (
          <button
            type="button"
            onClick={() => pickOption(null)}
            className="ml-1.5 flex shrink-0 items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <IconChevronLeft size={12} />
            {option.label}
          </button>
        )}
        <Command.Input
          ref={inputRef}
          value={search}
          onValueChange={setSearch}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && option && search === "") pickOption(null);
          }}
          placeholder={
            option
              ? `Search ${option.targetType ? `${typeName(option.targetType)}s` : "this Space"}…`
              : "How are they related?"
          }
          className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Command.List className="max-h-64 overflow-y-auto p-1">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          No matches.
        </Command.Empty>
        {option === null
          ? options.map((o) => (
              <Command.Item
                key={o.key}
                value={`${o.label} ${o.description}`}
                onSelect={() => pickOption(o)}
                className="flex cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.targetType && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {typeName(o.targetType)}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{o.description}</span>
              </Command.Item>
            ))
          : targets.map(({ entity, session }) => (
              <Command.Item
                key={entity.id}
                value={`${displayTitle(entity)} ${entity.id} ${session?.date ?? ""}`}
                keywords={keyKeywords(entity.key)}
                onSelect={() => onSelect(entity, option.type, option.reverse)}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
              >
                <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
                <EntityKey entityKey={entity.key} />
                <span className="min-w-0 flex-1 truncate">{displayTitle(entity)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {session
                    ? `${formatShortDate(session.date)}, ${formatClock(session.startTime)}`
                    : typeName(entity.type)}
                </span>
              </Command.Item>
            ))}
      </Command.List>
    </Command>
  );
}
