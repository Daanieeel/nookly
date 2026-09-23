import { IconArrowRight, IconBolt, IconCategory, IconFolder } from "@tabler/icons-react";
import { Command } from "cmdk";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "@/components/action-feedback";
import { EntityIcon, iconForType } from "@/components/entity-icon";
import {
  type ActiveFilter,
  applyFilters,
  type FilterField,
  FilterMenu,
} from "@/components/filter-menu";
import {
  Highlighted,
  SpaceGlyph,
  SpotlightDialog,
  SpotlightEmpty,
  SpotlightFooter,
  SpotlightInput,
  SpotlightItem,
  SpotlightList,
} from "@/components/spotlight";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { createCourse } from "@/lib/api/courses";
import { listEntities } from "@/lib/api/entities";
import type { Entity, SearchHit, Space } from "@/lib/api/types";
import { createJot, createNote, createRefinement } from "@/lib/api/notes";
import { search } from "@/lib/api/search";
import { listSpaceModules, listSpaces } from "@/lib/api/spaces";
import { createTask } from "@/lib/api/tasks";
import { displayTitle } from "@/lib/entity-title";
import { MODULE_KEYS } from "@/lib/modules";
import {
  groupHits,
  snippetSegments,
  termSegments,
  TYPE_GROUPS,
  typeGroupFor,
} from "@/lib/search-results";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";

/// Entity types simple enough to be created directly from the palette with just a
/// title (§3.2/§9 — "typing task: jumps straight into task creation"). Anything
/// requiring more context (Exam, Assignment, Session, Bookmark, File…) is a jump
/// to that module's own tailored creation surface instead, not a bare title field.
/// Each still goes through its real create_* command (not the bare generic entity
/// insert) since Tasks/Courses also need a matching row in their own table.
interface QuickCreateType {
  type: string;
  label: string;
  create: (spaceId: string, title: string) => Promise<Entity>;
}

/// Offered in the empty state as a one keystroke create. A Note drops straight
/// into its canvas, so it needs no title first.
const CREATE_NOTE: QuickCreateType = { type: "note", label: "Note", create: createNote };

const QUICK_CREATE_TYPES: QuickCreateType[] = [
  {
    type: "task",
    label: "Task",
    create: (s, t) => createTask(s, t, null, null).then((r) => r.entity),
  },
  CREATE_NOTE,
  { type: "jot", label: "Jot", create: createJot },
  { type: "refinement", label: "Refinement", create: createRefinement },
  { type: "course", label: "Course", create: createCourse },
];

interface QuickCreateMatch extends QuickCreateType {
  title: string;
}

/// Recognizes `task:` / `note:`-style prefixes and a plain `new task …` phrasing,
/// pulling out whatever's typed after the type name as the entity's title.
function matchQuickCreate(trimmed: string): QuickCreateMatch[] {
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const matches: QuickCreateMatch[] = [];
  for (const c of QUICK_CREATE_TYPES) {
    const colonPrefix = `${c.type}:`;
    if (lower.startsWith(colonPrefix)) {
      matches.push({ ...c, title: trimmed.slice(colonPrefix.length).trim() });
      continue;
    }
    if (lower.startsWith("new ")) {
      const rest = trimmed.slice(4);
      const restLower = rest.toLowerCase();
      const labelLower = c.label.toLowerCase();
      if (restLower.startsWith(labelLower)) {
        matches.push({ ...c, title: rest.slice(c.label.length).trim() });
      } else if (rest.length > 0 && labelLower.startsWith(restLower)) {
        matches.push({ ...c, title: "" });
      }
    }
  }
  return matches;
}

/// Items shown per Space and type group before collapsing into "View all (N)".
const GROUP_PREVIEW_LIMIT = 3;

/// Leading glyph for every quick action row, so "create a Task" never reads
/// like "open an existing Task".
function ActionGlyph() {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
      <IconBolt size={12} />
    </span>
  );
}

/// Global Cmd+K: search everything, jump anywhere, create things. The one entry
/// point for search, also opened from the titlebar. Cmd+P is the lighter
/// `QuickSwitcher` sibling.
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openEntity, setView, activeSpaceId, recents } =
    useNavStore();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const trimmed = query.trim();

  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const { data: entities } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
    enabled: paletteOpen,
  });
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => search(trimmed),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  });

  const quickCreate = useMutation({
    mutationFn: (vars: {
      type: string;
      create: (spaceId: string, title: string) => Promise<Entity>;
      title: string;
    }) =>
      // SAFETY: every quick create entry point is gated on `activeSpace` being
      // set, so this mutation is never invoked while `activeSpaceId` is null.
      vars.create(activeSpaceId as string, vars.title),
    onSuccess: (entity) => {
      // Invalidate every cached list keyed by this Space (["entities", id], ["tasks", id],
      // ["courses", id], …) rather than guessing which one this entity type feeds.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.includes(entity.spaceId),
      });
      queryClient.invalidateQueries({ queryKey: ["entities", "all"] });
      openEntity(entity.id, entity.spaceId);
      setPaletteOpen(false);
    },
  });

  /// There's no Space home view, so "Go to" lands on the Space's first module.
  const goToSpace = useMutation({
    mutationFn: async (space: Space) => {
      const modules = await listSpaceModules(space.id);
      return { space, module: MODULE_KEYS.find((m) => modules.includes(m)) };
    },
    onSuccess: ({ space, module }) => {
      if (module) setView({ kind: "module", spaceId: space.id, module });
      else useNavStore.getState().setActiveSpace(space.id);
      setPaletteOpen(false);
    },
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(!useNavStore.getState().paletteOpen);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPaletteOpen]);

  const { reset: resetQuickCreate } = quickCreate;
  const { reset: resetGoToSpace } = goToSpace;
  useEffect(() => {
    if (paletteOpen) return;
    setQuery("");
    setFilters([]);
    resetQuickCreate();
    resetGoToSpace();
  }, [paletteOpen, resetQuickCreate, resetGoToSpace]);

  const filtered = filters.length > 0;
  const filterFields: FilterField[] = [
    {
      id: "space",
      label: "Space",
      icon: IconFolder,
      options: spaces.map((s) => ({
        value: s.id,
        label: s.name,
        icon: <SpaceGlyph space={s} size={14} />,
      })),
    },
    {
      id: "type",
      label: "Type",
      icon: IconCategory,
      options: TYPE_GROUPS.map((g) => {
        const Icon = iconForType(g.types[0] ?? "");
        return { value: g.key, label: g.label, icon: <Icon size={14} /> };
      }),
    },
  ];
  const passesFilters = <T extends { spaceId: string; type: string }>(items: T[]) =>
    applyFilters(items, filters, (item, fieldId) =>
      fieldId === "space" ? item.spaceId : typeGroupFor(item.type).key,
    );
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  // Filters narrow the search to existing things, so actions step aside.
  const createMatches = activeSpace && !filtered ? matchQuickCreate(trimmed) : [];
  const lowerQuery = trimmed.toLowerCase();
  const spaceMatches =
    lowerQuery.length >= 2 && !filtered
      ? spaces.filter((s) => s.name.toLowerCase().startsWith(lowerQuery))
      : [];
  const groups = groupHits(passesFilters(hits), spaces);
  // With a type filter set, groups are already narrowed, so show them in full.
  const perGroupLimit = filters.some((f) => f.fieldId === "type") ? Infinity : GROUP_PREVIEW_LIMIT;

  function refocusInput() {
    inputRef.current?.focus();
  }

  const entityById = new Map((entities ?? []).map((e) => [e.id, e]));
  const recentEntities = passesFilters(
    recents.flatMap((r) => {
      const entity = entityById.get(r.entityId);
      return entity ? [entity] : [];
    }),
  );

  function close() {
    setPaletteOpen(false);
  }

  function renderCreateItem(m: QuickCreateMatch) {
    const status = quickCreate.variables?.type === m.type ? statusOf(quickCreate) : "idle";
    const errorLabel = `Couldn't create ${m.label}, try again`;
    return (
      <SpotlightItem
        key={m.type}
        value={`create-${m.type}`}
        onSelect={() => {
          if (quickCreate.isPending) return;
          quickCreate.mutate({
            type: m.type,
            create: m.create,
            title: m.title || `Untitled ${m.label}`,
          });
        }}
      >
        <StatusIcon status={status} size={16} idle={<ActionGlyph />} />
        <span className={cn("min-w-0 flex-1 truncate", statusTextClass(status))}>
          {status === "error" ? (
            errorLabel
          ) : (
            <>
              New {m.label}
              {m.title ? `: ${m.title}` : "…"}
            </>
          )}
        </span>
        {activeSpace && <InSpace space={activeSpace} />}
        <StatusAnnouncer message={status === "error" ? errorLabel : null} />
      </SpotlightItem>
    );
  }

  function renderGoToItem(space: Space) {
    const status = goToSpace.variables?.id === space.id ? statusOf(goToSpace) : "idle";
    const errorLabel = `Couldn't open ${space.name}, try again`;
    return (
      <SpotlightItem
        key={space.id}
        value={`goto-${space.id}`}
        onSelect={() => {
          if (!goToSpace.isPending) goToSpace.mutate(space);
        }}
      >
        <StatusIcon status={status} size={16} idle={<ActionGlyph />} />
        <span className={cn("min-w-0 flex-1 truncate", statusTextClass(status))}>
          {status === "error" ? errorLabel : `Go to ${space.name}`}
        </span>
        <SpaceGlyph space={space} size={14} />
        <StatusAnnouncer message={status === "error" ? errorLabel : null} />
      </SpotlightItem>
    );
  }

  function renderHit(hit: SearchHit) {
    const value = hit.blockId ? `block-${hit.blockId}` : `entity-${hit.entityId}`;
    return (
      <SpotlightItem
        key={value}
        value={value}
        onSelect={() => {
          openEntity(hit.entityId, hit.spaceId, hit.blockId ?? undefined);
          close();
        }}
        className="items-start"
      >
        <EntityIcon entity={hit} size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {hit.snippet ? (
            <>
              <span className="truncate text-muted-foreground">{displayTitle(hit)}</span>
              <span className="line-clamp-2 text-foreground/90">
                <Highlighted segments={snippetSegments(hit.snippet)} />
              </span>
            </>
          ) : (
            <span className="truncate">
              <Highlighted segments={termSegments(displayTitle(hit), trimmed)} />
            </span>
          )}
        </span>
      </SpotlightItem>
    );
  }

  const otherSpaces = spaces.filter((s) => s.id !== activeSpace?.id);
  const hasActions = createMatches.length > 0 || spaceMatches.length > 0;

  return (
    <SpotlightDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Search">
      <SpotlightInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder="Search, create, or jump anywhere…"
        onKeyDown={(e) => {
          // Backspace on an empty input removes the most recent filter.
          if (e.key === "Backspace" && query === "" && filtered) setFilters(filters.slice(0, -1));
        }}
      />
      <div className="border-b border-border/70 px-4 py-2">
        <FilterMenu
          fields={filterFields}
          filters={filters}
          onFiltersChange={setFilters}
          onDone={refocusInput}
        />
      </div>
      <SpotlightList>
        {trimmed.length === 0 ? (
          <>
            {recentEntities.length > 0 && (
              <Command.Group heading="Recents">
                {recentEntities.map((entity) => (
                  <SpotlightItem
                    key={entity.id}
                    value={`recent-${entity.id}`}
                    onSelect={() => {
                      openEntity(entity.id, entity.spaceId);
                      close();
                    }}
                  >
                    <EntityIcon
                      entity={entity}
                      size={16}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">{displayTitle(entity)}</span>
                  </SpotlightItem>
                ))}
              </Command.Group>
            )}
            {filtered ? (
              <SpotlightEmpty>Type to search within these filters.</SpotlightEmpty>
            ) : (
              <Command.Group heading="Quick actions">
                {activeSpace && (
                  <>
                    <SpotlightItem value="suggest-task" onSelect={() => setQuery("New Task ")}>
                      <ActionGlyph />
                      <span className="min-w-0 flex-1 truncate">New Task…</span>
                      <InSpace space={activeSpace} />
                    </SpotlightItem>
                    {renderCreateItem({ ...CREATE_NOTE, title: "" })}
                  </>
                )}
                {otherSpaces.map(renderGoToItem)}
              </Command.Group>
            )}
          </>
        ) : (
          <>
            {hasActions && (
              <Command.Group heading="Quick actions">
                {createMatches.map(renderCreateItem)}
                {spaceMatches.map(renderGoToItem)}
              </Command.Group>
            )}
            {groups.map(({ space, types }) => (
              <div key={space.id} className="pt-2 first:pt-0">
                <div className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-foreground/80 uppercase">
                  <SpaceGlyph space={space} size={14} />
                  <span className="truncate">{space.name}</span>
                </div>
                {types.map((group) => (
                  <Command.Group key={group.key} heading={group.label}>
                    {group.hits.slice(0, perGroupLimit).map(renderHit)}
                    {group.hits.length > perGroupLimit && (
                      <SpotlightItem
                        value={`viewall-${space.id}-${group.key}`}
                        onSelect={() =>
                          setFilters([
                            { fieldId: "space", operator: "is", values: [space.id] },
                            { fieldId: "type", operator: "is", values: [group.key] },
                          ])
                        }
                        className="text-muted-foreground"
                      >
                        <IconArrowRight size={16} className="shrink-0" />
                        <span>View all ({group.hits.length})</span>
                      </SpotlightItem>
                    )}
                  </Command.Group>
                ))}
              </div>
            ))}
            {!isFetching && <SpotlightEmpty>Nothing matches “{trimmed}”.</SpotlightEmpty>}
          </>
        )}
      </SpotlightList>
      <SpotlightFooter
        aside={
          <>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>P</Kbd>
            </KbdGroup>
            Quick open
          </>
        }
      />
    </SpotlightDialog>
  );
}

function InSpace({ space }: { space: Space }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      in
      <SpaceGlyph space={space} size={12} />
      <span className="max-w-32 truncate">{space.name}</span>
    </span>
  );
}
