import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EntityIcon, iconForType } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
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
import { listEntities } from "@/lib/api/entities";
import { listEmbeddedPageIds } from "@/lib/api/search";
import { listSpaces } from "@/lib/api/spaces";
import type { Entity } from "@/lib/api/types";
import { matchesKey } from "@/lib/entity-key";
import { displayTitle, labelForType } from "@/lib/entity-title";
import { fuzzyMatch, type TextSegment } from "@/lib/search-results";
import { useNavStore } from "@/lib/store/nav";

const MAX_RESULTS = 50;

interface SwitcherRow {
  entity: Entity;
  segments: TextSegment[];
}

/// Cmd+P quick open: a flat, title only fuzzy jump to anything that already
/// exists. No grouping, no creation. Cmd+K is the full search surface.
export function QuickSwitcher() {
  const open = useNavStore((s) => s.switcherOpen);
  const setOpen = useNavStore((s) => s.setSwitcherOpen);
  const openEntity = useNavStore((s) => s.openEntity);
  const recents = useNavStore((s) => s.recents);
  const [query, setQuery] = useState("");

  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const { data: allEntities = [] } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
    enabled: open,
  });
  // Notes embedded in a Course/Semester page aren't destinations of their own.
  const { data: embeddedIds = [] } = useQuery({
    queryKey: ["embedded-page-ids"],
    queryFn: listEmbeddedPageIds,
    enabled: open,
  });
  const embedded = new Set(embeddedIds);
  const entities = allEntities.filter((e) => !embedded.has(e.id));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen(!useNavStore.getState().switcherOpen);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const rows = rankRows(
    entities,
    query,
    recents.map((r) => r.entityId),
  );
  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  return (
    <SpotlightDialog
      open={open}
      onOpenChange={setOpen}
      title="Quick open"
      dirty={query !== ""}
      onClear={() => setQuery("")}
    >
      <SpotlightInput value={query} onValueChange={setQuery} placeholder="Jump to…" />
      <SpotlightList>
        <SpotlightEmpty>
          {query.trim() ? `Nothing matches “${query.trim()}”.` : "Nothing to open yet."}
        </SpotlightEmpty>
        {rows.map(({ entity, segments }) => {
          const space = spaceById.get(entity.spaceId);
          const TypeIcon = iconForType(entity.type);
          return (
            <SpotlightItem
              key={entity.id}
              value={entity.id}
              onSelect={() => {
                openEntity(entity.id, entity.spaceId);
                setOpen(false);
              }}
            >
              <EntityIcon entity={entity} size={16} className="shrink-0 text-muted-foreground" />
              <EntityKey entityKey={entity.key} />
              <span className="min-w-0 flex-1 truncate">
                <Highlighted segments={segments} />
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {space && (
                  <span className="flex max-w-36 items-center gap-1.5">
                    <SpaceGlyph space={space} size={12} />
                    <span className="truncate">{space.name}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <TypeIcon size={12} className="shrink-0" />
                  {labelForType(entity.type)}
                </span>
              </span>
            </SpotlightItem>
          );
        })}
      </SpotlightList>
      <SpotlightFooter
        aside={
          <>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
            Search everything
          </>
        }
      />
    </SpotlightDialog>
  );
}

/// Empty query: recents first, then everything else by last update. Typed
/// query: fuzzy title matches, best tier first.
function rankRows(entities: Entity[], query: string, recentIds: string[]): SwitcherRow[] {
  if (!query.trim()) {
    const recentRank = new Map(recentIds.map((id, i) => [id, i]));
    return [...entities]
      .sort((a, b) => {
        const ra = recentRank.get(a.id) ?? Infinity;
        const rb = recentRank.get(b.id) ?? Infinity;
        if (ra !== rb) return ra - rb;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, MAX_RESULTS)
      .map((entity) => ({ entity, segments: [{ text: displayTitle(entity), match: false }] }));
  }
  return entities
    .flatMap((entity) => {
      // A typed key (`TSK-14`) ranks its entity above every title match.
      if (matchesKey(entity.key, query)) {
        const segments = [{ text: displayTitle(entity), match: false }];
        return [{ entity, match: { tier: -1, spread: entity.key.length, segments } }];
      }
      const match = fuzzyMatch(displayTitle(entity), query);
      return match ? [{ entity, match }] : [];
    })
    .sort(
      (a, b) =>
        a.match.tier - b.match.tier ||
        a.match.spread - b.match.spread ||
        a.entity.title.length - b.entity.title.length,
    )
    .slice(0, MAX_RESULTS)
    .map(({ entity, match }) => ({ entity, segments: match.segments }));
}
