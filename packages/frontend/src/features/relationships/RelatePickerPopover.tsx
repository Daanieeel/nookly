import { dialogPopover } from "#/lib/dialog-popover.ts";
import { qk } from "#/lib/query-keys.ts";
import { Command } from "cmdk";
import { IconChevronLeft } from "@tabler/icons-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { listEntities } from "#/lib/api/entities.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import type { Entity, RelationshipTypeInfo, SessionOccurrence } from "#/lib/api/types.ts";
import { formatClock, formatShortDate } from "#/lib/datetime.ts";
import { keyKeywords } from "#/lib/entity-key.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";

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
  // The target step has chips and course context, so it gets more room.
  const [wide, setWide] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setWide(false);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent {...dialogPopover(cn(wide ? "w-96" : "w-72", "p-0"))} align="start">
        <RelatePicker
          onTargetStep={setWide}
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
  onTargetStep,
}: {
  spaceId: string;
  exclude: string;
  entityType: string;
  types: RelationshipTypeInfo[];
  onSelect: (target: Entity, relationshipType: string, reverse: boolean) => void;
  /// Tells the host whether the target step (the wider one) is showing.
  onTargetStep?: (onTargetStep: boolean) => void;
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
  const courseNoteIds = useCourseNoteIds(
    exclude,
    entityType,
    option?.targetType === "note" || option?.targetType === "jot",
  );
  const [chip, setChip] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  // The list remounts per step, so hand focus back to the search each time.
  useEffect(() => {
    inputRef.current?.focus();
    onTargetStep?.(option !== null);
  }, [option, onTargetStep]);

  const pickOption = (next: RelateOption | null) => {
    setOption(next);
    setSearch("");
    setChip(null);
  };

  const targets = entities
    .filter((e) => e.id !== exclude && (!option?.targetType || e.type === option.targetType))
    .map((entity) => ({ entity, session: sessionById.get(entity.id) }))
    .sort(newestFirst);
  const groups = groupTargets(targets, courseNoteIds);
  const filtered = chip === null ? groups : groups.filter((g) => g.name === chip);
  // Everything shows once the user is looking for something; the cap only tames the browse view.
  const capped = chip === null && search.trim() === "";

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
      {option && groups.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border p-1.5">
          <TypeChip
            label="All"
            count={targets.length}
            active={chip === null}
            onClick={() => setChip(null)}
          />
          {groups.map((g) => (
            <TypeChip
              key={g.name}
              label={g.name}
              count={g.items.length}
              active={chip === g.name}
              onClick={() => setChip(chip === g.name ? null : g.name)}
            />
          ))}
        </div>
      )}
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
          : filtered.map((group) => (
              <Command.Group
                key={group.name}
                heading={group.name}
                className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:text-muted-foreground"
              >
                {(capped ? group.items.slice(0, GROUP_CAP) : group.items).map(
                  ({ entity, session }) => (
                    <Command.Item
                      key={entity.id}
                      value={`${displayTitle(entity)} ${typeName(entity.type)} ${session?.courseTitle ?? ""} ${entity.id} ${session?.date ?? ""}`}
                      keywords={keyKeywords(entity.key)}
                      onSelect={() => onSelect(entity, option.type, option.reverse)}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                    >
                      <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
                      <EntityKey entityKey={entity.key} />
                      <span className="min-w-0 flex-1 truncate">{displayTitle(entity)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {session ? sessionWhen(session) : typeName(entity.type)}
                      </span>
                    </Command.Item>
                  ),
                )}
                {capped && group.items.length > GROUP_CAP && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {group.items.length - GROUP_CAP} more, search or pick the type to see them
                  </p>
                )}
              </Command.Group>
            ))}
      </Command.List>
    </Command>
  );
}

/// Targets shown per group in the browse view.
const GROUP_CAP = 8;

const COURSE_NOTES_GROUP = "Notes of this course";

interface Target {
  entity: Entity;
  session: SessionOccurrence | undefined;
}

function newestFirst(a: Target, b: Target): number {
  if (a.session && b.session) {
    return `${b.session.date} ${b.session.startTime}`.localeCompare(
      `${a.session.date} ${a.session.startTime}`,
    );
  }
  return b.entity.updatedAt.localeCompare(a.entity.updatedAt);
}

/// A session row reads "Course, Mar 10, 09:00": a session's title is only its course.
function sessionWhen(session: SessionOccurrence): string {
  const when = `${formatShortDate(session.date)}, ${formatClock(session.startTime)}`;
  return session.courseTitle ? `${session.courseTitle}, ${when}` : when;
}

/// One group per entity type, most recent first, with the pages of the item's own
/// course ahead of the rest.
function groupTargets(targets: Target[], courseNoteIds: Set<string>) {
  const groups: { name: string; items: Target[] }[] = [];
  const inCourse = targets.filter((t) => courseNoteIds.has(t.entity.id));
  if (inCourse.length > 0) groups.push({ name: COURSE_NOTES_GROUP, items: inCourse });
  const byType = new Map<string, Target[]>();
  for (const target of targets) {
    if (courseNoteIds.has(target.entity.id)) continue;
    const name = capitalize(typeName(target.entity.type));
    byType.set(name, [...(byType.get(name) ?? []), target]);
  }
  for (const [name, items] of byType) groups.push({ name, items });
  return groups;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const COURSE_PAGE_LINKS = new Set(["course-notes", "course-jots", "course-note"]);

/// Ids of the notes and jots that belong to the course of `entityId` (a course itself,
/// or a session or page linked to one), so they can lead the target list.
function useCourseNoteIds(entityId: string, entityType: string, enabled: boolean): Set<string> {
  const { data: own = [] } = useQuery({
    queryKey: qk.relationships.of(entityId),
    queryFn: () => listRelationships(entityId, "both"),
    enabled,
  });
  const courseIds = new Set<string>(entityType === "course" ? [entityId] : []);
  for (const link of own) {
    if (link.relationshipType === "session-course" && link.fromEntityId === entityId) {
      courseIds.add(link.toEntityId);
    } else if (COURSE_PAGE_LINKS.has(link.relationshipType) && link.toEntityId === entityId) {
      courseIds.add(link.fromEntityId);
    }
  }
  const lists = useQueries({
    queries: [...courseIds].map((courseId) => ({
      queryKey: qk.relationships.of(courseId),
      queryFn: () => listRelationships(courseId, "both"),
      enabled,
    })),
  });
  const ids = new Set<string>();
  for (const list of lists) {
    for (const link of list.data ?? []) {
      if (COURSE_PAGE_LINKS.has(link.relationshipType)) ids.add(link.toEntityId);
    }
  }
  return ids;
}

function TypeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label} ${count}`}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
