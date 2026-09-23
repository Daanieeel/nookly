import { IconArrowRight, IconBolt, IconChevronDown, IconX } from "@tabler/icons-react";
import { Command } from "cmdk";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "@/components/action-feedback";
import { EntityIcon } from "@/components/entity-icon";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [filterSpaceId, setFilterSpaceId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
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
    queryKey: ["search", trimmed, filterSpaceId],
    queryFn: () => search(trimmed, filterSpaceId),
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
    setFilterSpaceId(null);
    setFilterType(null);
    resetQuickCreate();
    resetGoToSpace();
  }, [paletteOpen, resetQuickCreate, resetGoToSpace]);

  const filtered = filterSpaceId !== null || filterType !== null;
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  // Filters narrow the search to existing things, so actions step aside.
  const createMatches = activeSpace && !filtered ? matchQuickCreate(trimmed) : [];
  const lowerQuery = trimmed.toLowerCase();
  const spaceMatches =
    lowerQuery.length >= 2 && !filtered
      ? spaces.filter((s) => s.name.toLowerCase().startsWith(lowerQuery))
      : [];
  const groups = groupHits(
    filterType ? hits.filter((h) => typeGroupFor(h.type).key === filterType) : hits,
    spaces,
  );
  // With a type filter set, every group is already the "view all" of itself.
  const perGroupLimit = filterType ? Infinity : GROUP_PREVIEW_LIMIT;

  function refocusInput() {
    inputRef.current?.focus();
  }

  const entityById = new Map((entities ?? []).map((e) => [e.id, e]));
  const recentEntities = recents.flatMap((r) => {
    const entity = entityById.get(r.entityId);
    return entity ? [entity] : [];
  });

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
          // Backspace on an empty input peels filters off, most specific first.
          if (e.key !== "Backspace" || query !== "") return;
          if (filterType) setFilterType(null);
          else if (filterSpaceId) setFilterSpaceId(null);
        }}
      />
      <SearchFilters
        spaces={spaces}
        spaceId={filterSpaceId}
        typeKey={filterType}
        onSpaceChange={setFilterSpaceId}
        onTypeChange={setFilterType}
        onMenuClosed={refocusInput}
      />
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
                        onSelect={() => {
                          setFilterSpaceId(space.id);
                          setFilterType(group.key);
                        }}
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

function SearchFilters({
  spaces,
  spaceId,
  typeKey,
  onSpaceChange,
  onTypeChange,
  onMenuClosed,
}: {
  spaces: Space[];
  spaceId: string | null;
  typeKey: string | null;
  onSpaceChange: (spaceId: string | null) => void;
  onTypeChange: (typeKey: string | null) => void;
  /// Hands focus back to the search input once a menu closes.
  onMenuClosed: () => void;
}) {
  const space = spaces.find((s) => s.id === spaceId);
  const type = TYPE_GROUPS.find((g) => g.key === typeKey);
  const closeAutoFocus = (e: Event) => {
    e.preventDefault();
    onMenuClosed();
  };

  return (
    <div className="flex items-center gap-1.5 border-b border-border/70 px-4 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={space ? "secondary" : "ghost"} size="sm" className="gap-1.5">
            {space && <SpaceGlyph space={space} size={12} />}
            {space?.name ?? "All Spaces"}
            <IconChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={closeAutoFocus}>
          <DropdownMenuRadioGroup
            value={spaceId ?? ""}
            onValueChange={(v) => onSpaceChange(v || null)}
          >
            <DropdownMenuRadioItem value="">All Spaces</DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {spaces.map((s) => (
              <DropdownMenuRadioItem key={s.id} value={s.id}>
                <SpaceGlyph space={s} size={14} />
                {s.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={type ? "secondary" : "ghost"} size="sm" className="gap-1.5">
            {type?.label ?? "All types"}
            <IconChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={closeAutoFocus}>
          <DropdownMenuRadioGroup
            value={typeKey ?? ""}
            onValueChange={(v) => onTypeChange(v || null)}
          >
            <DropdownMenuRadioItem value="">All types</DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {TYPE_GROUPS.map((g) => (
              <DropdownMenuRadioItem key={g.key} value={g.key}>
                {g.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {(space || type) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSpaceChange(null);
            onTypeChange(null);
            onMenuClosed();
          }}
          className="ml-auto gap-1"
        >
          <IconX />
          Clear filters
        </Button>
      )}
    </div>
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
