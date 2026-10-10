import { IconChevronLeft } from "@tabler/icons-react";
import { Command, defaultFilter } from "cmdk";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";
import { listEntities } from "#/lib/api/entities.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import type { Entity, RelationshipTypeInfo, SessionOccurrence } from "#/lib/api/types.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { dialogPopover } from "#/lib/dialog-popover.ts";
import { keyKeywords } from "#/lib/entity-key.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { sessionMatches, sessionWhen } from "#/lib/session-search.ts";

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
function relateOptions(types: RelationshipTypeInfo[], entityType: string): RelateOption[] {
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/// A popover with the picker in it. Search for what to relate to; the relationship type
/// is worked out from the two items (and can be changed).
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
      <PopoverContent {...dialogPopover("w-96 p-0")} align="start">
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

interface Target {
  entity: Entity;
  session: SessionOccurrence | undefined;
}

/// Targets shown in the browse view, and per heading.
const SUGGESTED_CAP = 5;
const RECENT_CAP = 8;

const ROW =
  "flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent";
const HEADING =
  "**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:text-muted-foreground";

/// The picker, in three steps that each ask one thing: what type of thing to relate to,
/// how (the relationship type, skipped when only one fits), and which one. The last step
/// leads with what belongs with this item (its course, that course's pages and sessions)
/// before anything is typed, then searches everything of the type in one list. The
/// choices made so far stay on top, and Back (or Backspace in an empty search) undoes the
/// last one.
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
  const options = useMemo(() => relateOptions(types, entityType), [types, entityType]);
  const [targetType, setTargetType] = useState<string | null>(null);
  const [option, setOption] = useState<RelateOption | null>(null);
  // The relationship step was skipped, so Back from the items goes past it.
  const [skipped, setSkipped] = useState(false);
  const [search, setSearch] = useState("");

  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  // A session's title is just its course, so its date and time tell them apart.
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
    enabled: targetType === "session",
  });
  const sessionById = new Map(sessions.map((s) => [s.entity.id, s]));
  const related = useRelatedIds(exclude, entityType, targetType !== null);

  const candidatesFor = (type: string) =>
    options
      .filter((o) => o.targetType === null || o.targetType === type)
      .toSorted((a, b) => Number(b.targetType !== null) - Number(a.targetType !== null));
  const others = entities.filter((entity) => entity.id !== exclude);

  // Step 1: the types that have something to relate to and a way to do it.
  const typeCounts = new Map<string, number>();
  for (const entity of others) {
    if (candidatesFor(entity.type).length > 0) {
      typeCounts.set(entity.type, (typeCounts.get(entity.type) ?? 0) + 1);
    }
  }
  const typeRows = [...typeCounts].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const step = targetType === null ? 1 : option === null ? 2 : 3;
  const choose = (type: string) => {
    const candidates = candidatesFor(type);
    setSearch("");
    setTargetType(type);
    if (candidates.length === 1 && candidates[0]) {
      setOption(candidates[0]);
      setSkipped(true);
    }
  };
  const back = () => {
    setSearch("");
    if (step === 3 && !skipped) setOption(null);
    else {
      setOption(null);
      setTargetType(null);
      setSkipped(false);
    }
  };

  const targets: Target[] = others
    .filter((entity) => entity.type === targetType)
    .map((entity) => ({ entity, session: sessionById.get(entity.id) }))
    .toSorted(newestFirst);
  const query = search.trim();
  const valueOf = (t: Target) =>
    `${displayTitle(t.entity)} ${typeName(t.entity.type)} ${t.session?.courseTitle ?? ""} ${t.entity.id} ${t.session?.date ?? ""}`;
  const suggested = query
    ? []
    : targets.filter((t) => related.has(t.entity.id)).slice(0, SUGGESTED_CAP);
  const suggestedIds = new Set(suggested.map((t) => t.entity.id));
  const recent = query
    ? []
    : targets.filter((t) => !suggestedIds.has(t.entity.id)).slice(0, RECENT_CAP);
  const hiddenCount = query ? 0 : targets.length - suggested.length - recent.length;
  // Filtered here, best match first, so the list needs no filtering of its own on this step.
  const matches = query
    ? targets
        .map((t) => ({
          t,
          // A session is found by its course and its day and time, written the usual ways.
          score: t.session
            ? Math.max(
                Number(sessionMatches(t.session, query)),
                defaultFilter(t.entity.key, query, []),
              )
            : defaultFilter(valueOf(t), query, keyKeywords(t.entity.key)),
        }))
        .filter((m) => m.score > 0)
        .toSorted((a, b) => b.score - a.score)
        .map((m) => m.t)
    : [];

  const row = (t: Target) => (
    <Command.Item
      key={t.entity.id}
      value={valueOf(t)}
      onSelect={() => option && onSelect(t.entity, option.type, option.reverse)}
      className={ROW}
    >
      <EntityIcon entity={t.entity} className="shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{displayTitle(t.entity)}</span>
        <span className="truncate text-xs text-muted-foreground">{context(t)}</span>
      </span>
    </Command.Item>
  );

  const placeholder =
    step === 1 ? "Search types…" : step === 2 ? "Search relations…" : "Search what to relate to…";

  return (
    <Command key={step} shouldFilter={step !== 3} className="flex flex-col">
      {step > 1 && (
        <nav
          aria-label="Relation"
          className="flex items-center gap-1 border-b border-border px-1.5 py-1 text-xs"
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label="Back"
            onClick={back}
          >
            <IconChevronLeft size={14} />
          </Button>
          <span className="min-w-0 truncate text-muted-foreground">
            {capitalize(typeName(entityType))}
            {option ? (
              <>
                {" · "}
                <span className="text-foreground">{option.label}</span>
              </>
            ) : null}
            {" · "}
            <span className="text-foreground">{capitalize(typeName(targetType ?? ""))}</span>
          </span>
        </nav>
      )}
      <Command.Input
        autoFocus
        value={search}
        onValueChange={setSearch}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && step > 1 && search === "") back();
        }}
        placeholder={placeholder}
        className="h-9 min-w-0 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-72 overflow-y-auto p-1">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          No matches.
        </Command.Empty>
        {step === 1 &&
          typeRows.map(([type, count]) => (
            <Command.Item
              key={type}
              value={capitalize(typeName(type))}
              onSelect={() => choose(type)}
              className={ROW}
            >
              <EntityIcon
                entity={{ type, icon: null }}
                className="shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate">{capitalize(typeName(type))}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
            </Command.Item>
          ))}
        {step === 2 &&
          candidatesFor(targetType ?? "").map((o) => (
            <Command.Item
              key={o.key}
              value={`${o.label} ${o.description}`}
              onSelect={() => setOption(o)}
              className={cn(ROW, "flex-col items-start gap-0.5")}
            >
              <span>{o.label}</span>
              {o.description && (
                <span className="text-xs text-muted-foreground">{o.description}</span>
              )}
            </Command.Item>
          ))}
        {step === 3 &&
          (query ? (
            matches.map(row)
          ) : (
            <>
              {suggested.length > 0 && (
                <Command.Group heading="Suggested" className={HEADING}>
                  {suggested.map(row)}
                </Command.Group>
              )}
              {recent.length > 0 && (
                <Command.Group heading="Recent" className={HEADING}>
                  {recent.map(row)}
                </Command.Group>
              )}
              {hiddenCount > 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {hiddenCount} more, search to find them
                </p>
              )}
            </>
          ))}
      </Command.List>
    </Command>
  );
}

function newestFirst(a: Target, b: Target): number {
  if (a.session && b.session) {
    return `${b.session.date} ${b.session.startTime}`.localeCompare(
      `${a.session.date} ${a.session.startTime}`,
    );
  }
  return b.entity.updatedAt.localeCompare(a.entity.updatedAt);
}

/// The second line of a row: what it is, and when it last changed.
function context(target: Target): string {
  if (target.session) return sessionWhen(target.session);
  const edited = formatShortDate(target.entity.updatedAt.slice(0, 10));
  return `${capitalize(typeName(target.entity.type))} · Edited ${edited}`;
}

const COURSE_PAGE_LINKS = new Set(["course-notes", "course-jots", "course-note"]);

/// Ids of what belongs with `entityId`: its course, that course's notes and jots and, for
/// anything but a session, that course's sessions. The course of a session or page is
/// the one it is linked to; a course is its own.
function useRelatedIds(entityId: string, entityType: string, enabled: boolean): Set<string> {
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
  const ids = new Set<string>(entityType === "course" ? [] : courseIds);
  for (const list of lists) {
    for (const link of list.data ?? []) {
      if (COURSE_PAGE_LINKS.has(link.relationshipType)) ids.add(link.toEntityId);
      else if (link.relationshipType === "session-course" && entityType !== "session") {
        ids.add(link.fromEntityId);
      }
    }
  }
  ids.delete(entityId);
  return ids;
}
