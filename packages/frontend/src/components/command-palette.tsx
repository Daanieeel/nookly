import { IconArrowRight, IconCategory, IconFolder, IconTag } from "@tabler/icons-react";
import { Command } from "cmdk";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EntityKey } from "#/components/entity-key.tsx";
import { EntityIcon, iconForType } from "#/components/entity-icon.tsx";
import {
  type ActiveFilter,
  applyFilters,
  type FilterField,
  FilterMenu,
} from "#/components/filter-menu.tsx";
import { LabelDot } from "#/components/label-chip.tsx";
import { QuickActions } from "#/components/quick-actions.tsx";
import {
  Highlighted,
  SpaceGlyph,
  SpotlightDialog,
  SpotlightEmpty,
  SpotlightFooter,
  SpotlightInput,
  SpotlightItem,
  SpotlightList,
} from "#/components/spotlight.tsx";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
import { listEntities } from "#/lib/api/entities.ts";
import { listEntityLabelIds, listLabels } from "#/lib/api/labels.ts";
import type { SearchHit } from "#/lib/api/types.ts";
import { search } from "#/lib/api/search.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import {
  groupHits,
  snippetSegments,
  termSegments,
  TYPE_GROUPS,
  typeGroupFor,
} from "#/lib/search-results.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// Items shown per Space and type group before collapsing into "View all (N)".
const GROUP_PREVIEW_LIMIT = 3;

/// Global Cmd+K: search everything, jump anywhere, create things. The one entry
/// point for search, also opened from the titlebar. Cmd+P is the lighter
/// `QuickSwitcher` sibling.
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openEntity, recents } = useNavStore();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const { data: entities } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
    enabled: paletteOpen,
  });
  const spaceIds = spaces.map((s) => s.id);
  // Labels are siloed per Space (§4.5), so the filter's option list and the
  // entity → label lookup both merge every Space's labels into one flat set.
  const { data: allLabels = [] } = useQuery({
    queryKey: ["labels", "all", spaceIds],
    queryFn: () => Promise.all(spaceIds.map((id) => listLabels(id))).then((lists) => lists.flat()),
    enabled: paletteOpen && spaceIds.length > 0,
  });
  const { data: entityLabelIds } = useQuery({
    queryKey: ["entity-label-ids", "all", spaceIds],
    queryFn: () =>
      Promise.all(spaceIds.map((id) => listEntityLabelIds(id))).then((maps) => {
        // SAFETY: the accumulator starts empty and every `map` is already a
        // `Record<string, string[]>`, so the merged object always matches too.
        const merged = {} as Record<string, string[]>;
        for (const map of maps) Object.assign(merged, map);
        return merged;
      }),
    enabled: paletteOpen && spaceIds.length > 0,
  });
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => search(trimmed),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
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

  useEffect(() => {
    if (paletteOpen) return;
    setQuery("");
    setFilters([]);
  }, [paletteOpen]);

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
    {
      id: "label",
      label: "Label",
      icon: IconTag,
      options: allLabels.map((l) => ({
        value: l.id,
        label: l.name,
        icon: <LabelDot label={l} />,
      })),
    },
  ];
  const passesFilters = <T extends { spaceId: string; type: string }>(
    items: T[],
    idOf: (item: T) => string,
  ) =>
    applyFilters(items, filters, (item, fieldId) => {
      if (fieldId === "space") return item.spaceId;
      if (fieldId === "label") return entityLabelIds?.[idOf(item)] ?? [];
      return typeGroupFor(item.type).key;
    });
  const groups = groupHits(
    passesFilters(hits, (h) => h.entityId),
    spaces,
  );
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
    (e) => e.id,
  );

  function close() {
    setPaletteOpen(false);
  }

  function renderHit(hit: SearchHit) {
    const value = hit.blockId ? `block-${hit.blockId}` : `entity-${hit.entityId}`;
    return (
      <SpotlightItem
        key={value}
        value={value}
        onSelect={() => {
          openEntity(
            hit.entityId,
            hit.spaceId,
            hit.blockId && hit.blockEntityId
              ? { entityId: hit.blockEntityId, blockId: hit.blockId }
              : undefined,
          );
          close();
        }}
        className="items-start"
      >
        <EntityIcon entity={hit} size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        <EntityKey entityKey={hit.key} className="mt-px leading-5" />
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

  return (
    <SpotlightDialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      title="Search"
      dirty={query !== "" || filtered}
      onClear={() => {
        setQuery("");
        setFilters([]);
      }}
    >
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
              <QuickActions query="" mode="suggestions" onDone={close} onRefocus={refocusInput} />
            )}
          </>
        ) : (
          <>
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
            {/* Always the last section, below every search result. Filters
                narrow the search to existing things, so actions step aside. */}
            {!filtered && (
              <QuickActions query={trimmed} mode="search" onDone={close} onRefocus={refocusInput} />
            )}
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
