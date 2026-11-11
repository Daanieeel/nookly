import { IconX } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { Kbd, KbdGroup } from "#/components/kbd.tsx";
import { LabelDot } from "#/components/label-chip.tsx";
import { QuickActions } from "#/components/quick-actions.tsx";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
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
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { listEntitiesByIds } from "#/lib/api/entities.ts";
import { listLabels } from "#/lib/api/labels.ts";
import { type SearchRequest, search } from "#/lib/api/search.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity, Label, SearchHit, Space } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  type SearchChip,
  chipText,
  finishedFilter,
  pendingFilter,
  suggestNames,
  withChip,
} from "#/lib/search-query.ts";
import { SEARCH_TABS, snippetSegments, termSegments } from "#/lib/search-results.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { foldText } from "#/lib/text-search.ts";
import { cn } from "@nookly/ui/lib/utils";

/// Rows one search can show.
const RESULT_LIMIT = 50;
/// Recents listed while nothing is typed.
const RECENT_LIMIT = 8;

/// How a result opens: where you are, a new tab, or the other split group.
type OpenHow = "here" | "tab" | "group";

interface Target {
  entityId: string;
  spaceId: string;
  /// A block to scroll to, and the page holding it.
  blockId?: string | null;
  blockEntityId?: string | null;
}

function openTarget(target: Target, how: OpenHow) {
  const nav = useNavStore.getState();
  if (how === "here") {
    nav.openEntity(
      target.entityId,
      target.spaceId,
      target.blockId && target.blockEntityId
        ? { entityId: target.blockEntityId, blockId: target.blockId }
        : undefined,
    );
    return;
  }
  nav.openInNewTab({ kind: "entity", entityId: target.entityId, spaceId: target.spaceId });
  if (how === "group") {
    // The new tab is the active one now. The other group takes it, or a new group on the right.
    const { activeTabId, focusedGroupId, groups } = useNavStore.getState();
    const other = groups.find((g) => g.id !== focusedGroupId);
    nav.moveTabToGroup(activeTabId, other ? { groupId: other.id } : "new-right");
  }
}

/// Cmd+K: search everything, jump anywhere, create things. The one entry point for
/// search, also opened from the titlebar.
export function SearchPalette() {
  const open = useNavStore((s) => s.paletteOpen);
  const setOpen = useNavStore((s) => s.setPaletteOpen);
  useAppHotkey("search", () => setOpen(!useNavStore.getState().paletteOpen));
  return (
    <SearchSurface
      open={open}
      onOpenChange={setOpen}
      title="Search"
      placeholder="Search, create, or jump anywhere…"
      titlesOnly={false}
      sibling={
        <>
          <ShortcutKbd name="commands" />
          Commands
          <ShortcutKbd name="quickSwitcher" className="ml-3" />
          Quick open
        </>
      }
    />
  );
}

/// Cmd+P: the same list as Cmd+K, restricted to titles and keys. No body search and
/// no snippets, so it answers at once.
export function QuickOpenPalette() {
  const open = useNavStore((s) => s.switcherOpen);
  const setOpen = useNavStore((s) => s.setSwitcherOpen);
  useAppHotkey("quickSwitcher", () => setOpen(!useNavStore.getState().switcherOpen));
  return (
    <SearchSurface
      open={open}
      onOpenChange={setOpen}
      title="Quick open"
      placeholder="Jump to…"
      titlesOnly
      sibling={
        <>
          <ShortcutKbd name="commands" />
          Commands
          <ShortcutKbd name="search" className="ml-3" />
          Search everything
        </>
      }
    />
  );
}

function SearchSurface({
  open,
  onOpenChange,
  title,
  placeholder,
  titlesOnly,
  sibling,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder: string;
  titlesOnly: boolean;
  sibling: React.ReactNode;
}) {
  const recents = useNavStore((s) => s.recents);
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<SearchChip[]>([]);
  // 0 is All, then one per `SEARCH_TABS`.
  const [tab, setTab] = useState(0);
  const [highlighted, setHighlighted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Spaces are already loaded for the sidebar. Labels load only once a `#` is typed.
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceIds = spaces.map((s) => s.id);
  const wantsLabels = open && /(^|\s)#/u.test(query);
  const { data: labels = [] } = useQuery({
    queryKey: qk.labels.forSpaces(spaceIds),
    queryFn: () => Promise.all(spaceIds.map((id) => listLabels(id))).then(distinctByName),
    enabled: wantsLabels && spaceIds.length > 0,
  });

  const pending = pendingFilter(query);
  const taken = new Set(chips.map((c) => foldText(chipText(c))));
  const suggestions = !pending
    ? []
    : pending.kind === "space"
      ? suggestNames(spaces, pending.partial)
          .filter((s) => !taken.has(foldText(`in:${s.name}`)))
          .map((s) => ({ name: s.name, space: s }))
      : suggestNames(labels, pending.partial)
          .filter((l) => !taken.has(foldText(`#${l.name}`)))
          .map((l) => ({ name: l.name, label: l }));
  const suggesting = pending !== null && suggestions.length > 0;

  const text = (suggesting ? pending.before : query).trim();
  const activeTab = tab > 0 ? SEARCH_TABS[tab - 1] : undefined;
  const spaceChip = chips.find((c) => c.kind === "space");
  const request: SearchRequest = {
    query: text,
    spaceId: spaceChip?.kind === "space" ? spaceChip.spaceId : undefined,
    types: activeTab?.types,
    labels: chips.flatMap((c) => (c.kind === "label" ? [c.name] : [])),
    titlesOnly,
    limit: RESULT_LIMIT,
  };
  // The first keystroke searches at once. A later one replaces the request, and the
  // backend drops the one it was still running.
  const { data: hits = [], isFetching } = useQuery({
    queryKey: qk.search(request),
    queryFn: () => search(request),
    enabled: open && text.length > 0 && !suggesting,
    placeholderData: keepPreviousData,
    gcTime: 0,
  });

  // Recents are the only thing that loads for an empty box.
  const recentIds = recents.slice(0, RECENT_LIMIT).map((r) => r.entityId);
  const showRecents = open && text === "" && !suggesting;
  const { data: recentEntities = [] } = useQuery({
    queryKey: qk.entitiesByIds(recentIds),
    queryFn: () => listEntitiesByIds(recentIds),
    enabled: showRecents && recentIds.length > 0,
  });
  const labelChips = chips.some((c) => c.kind === "label");
  const recentRows = labelChips
    ? []
    : recentEntities.filter(
        (e) =>
          (spaceChip?.kind !== "space" || e.spaceId === spaceChip.spaceId) &&
          (!activeTab || activeTab.types.includes(e.type)),
      );

  useEffect(() => {
    if (open) return;
    setQuery("");
    setChips([]);
    setTab(0);
  }, [open]);

  const rows: Row[] = suggesting
    ? suggestions.map((s) => ({ value: `suggest-${s.name}`, target: null }))
    : text === ""
      ? recentRows.map((e) => ({ value: `recent-${e.id}`, target: toTarget(e) }))
      : hits.map((h) => ({ value: `hit-${h.entityId}`, target: toTarget(h) }));
  const firstRow = rows[0]?.value ?? "";
  // The top result is pre selected, and Enter opens it. A new list starts there again.
  const rowKey = rows.map((r) => r.value).join("|");
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset only when the list changes
  useEffect(() => setHighlighted(firstRow), [rowKey]);

  function close() {
    onOpenChange(false);
  }

  function changeQuery(next: string) {
    const done = finishedFilter(next, spaces, labels);
    if (done) {
      setChips((current) => withChip(current, done.chip));
      setQuery(done.text);
    } else setQuery(next);
  }

  function pick(suggestion: (typeof suggestions)[number]) {
    const chip: SearchChip =
      "space" in suggestion
        ? { kind: "space", spaceId: suggestion.space.id, name: suggestion.name }
        : { kind: "label", name: suggestion.name };
    setChips((current) => withChip(current, chip));
    setQuery(pending?.before ?? "");
    inputRef.current?.focus();
  }

  function cycleTab(step: number) {
    setTab((current) => (current + step + SEARCH_TABS.length + 1) % (SEARCH_TABS.length + 1));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && chips.length > 0) {
      setChips(chips.slice(0, -1));
    } else if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      // Cmd+Enter opens in a new tab, Cmd+Option+Enter in the other split group.
      e.preventDefault();
      const target = rows.find((r) => r.value === highlighted)?.target;
      if (!target) return;
      openTarget(target, e.altKey ? "group" : "tab");
      close();
    }
  }

  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const filtered = chips.length > 0 || tab > 0;

  return (
    <SpotlightDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      dirty={query !== "" || filtered}
      onClear={() => {
        setQuery("");
        setChips([]);
        setTab(0);
      }}
      value={highlighted}
      onValueChange={setHighlighted}
    >
      <SpotlightInput
        ref={inputRef}
        value={query}
        onValueChange={changeQuery}
        placeholder={chips.length > 0 ? "" : placeholder}
        onKeyDown={onKeyDown}
        before={
          chips.length > 0 && (
            <span className="flex shrink-0 items-center gap-1.5">
              {chips.map((chip) => (
                <FilterChip
                  key={chipText(chip)}
                  chip={chip}
                  onRemove={() => {
                    setChips(chips.filter((c) => c !== chip));
                    inputRef.current?.focus();
                  }}
                />
              ))}
            </span>
          )
        }
      />
      <TypeTabs index={tab} onChange={setTab} />
      <SpotlightList>
        {suggesting ? (
          <Command.Group heading={pending.kind === "space" ? "Spaces" : "Labels"}>
            {suggestions.map((s) => (
              <SpotlightItem key={s.name} value={`suggest-${s.name}`} onSelect={() => pick(s)}>
                {"space" in s ? (
                  <SpaceGlyph space={s.space} size={16} />
                ) : (
                  <LabelDot label={s.label} />
                )}
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </SpotlightItem>
            ))}
          </Command.Group>
        ) : text === "" ? (
          <>
            {recentRows.length > 0 && (
              <Command.Group heading="Recents">
                {recentRows.map((entity) => (
                  <ResultRow
                    key={entity.id}
                    value={`recent-${entity.id}`}
                    entity={entity}
                    space={spaceById.get(entity.spaceId)}
                    terms=""
                    onOpen={() => {
                      openTarget(toTarget(entity), "here");
                      close();
                    }}
                  />
                ))}
              </Command.Group>
            )}
            <FilterHints />
            {!filtered && (
              <QuickActions
                query=""
                mode="suggestions"
                onDone={close}
                onRefocus={() => inputRef.current?.focus()}
              />
            )}
          </>
        ) : (
          <>
            {hits.map((hit) => (
              <ResultRow
                key={hit.entityId}
                value={`hit-${hit.entityId}`}
                entity={hit}
                snippet={hit.snippet}
                space={spaceById.get(hit.spaceId)}
                terms={text}
                onOpen={() => {
                  openTarget(toTarget(hit), "here");
                  close();
                }}
              />
            ))}
            {/* Always the last section, below every search result. Filters narrow the
                search to existing things, so actions step aside. */}
            {!titlesOnly && !filtered && (
              <QuickActions
                query={text}
                mode="search"
                onDone={close}
                onRefocus={() => inputRef.current?.focus()}
              />
            )}
            {!isFetching && <SpotlightEmpty>Nothing matches “{text}”.</SpotlightEmpty>}
          </>
        )}
      </SpotlightList>
      <SpotlightFooter
        hints={
          <>
            <span className="flex items-center gap-1.5">
              <Kbd>Tab</Kbd>
              Type
            </span>
            <span className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd>
              </KbdGroup>
              New tab
            </span>
            <span className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>⌥</Kbd>
                <Kbd>↵</Kbd>
              </KbdGroup>
              Other group
            </span>
          </>
        }
        aside={sibling}
      />
    </SpotlightDialog>
  );
}

interface Row {
  value: string;
  /// What Enter opens. Suggestions open nothing.
  target: Target | null;
}

function toTarget(item: Entity | SearchHit): Target {
  if ("entityId" in item) {
    return {
      entityId: item.entityId,
      spaceId: item.spaceId,
      blockId: item.blockId,
      blockEntityId: item.blockEntityId,
    };
  }
  return { entityId: item.id, spaceId: item.spaceId };
}

/// Labels from every Space, one per name, so `#urgent` means all of them.
function distinctByName(lists: Label[][]): Label[] {
  const seen = new Map<string, Label>();
  for (const label of lists.flat()) {
    const key = foldText(label.name);
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()];
}

/// One result: the type icon, the title, the entity key, a Space chip, and under the title
/// the line of text that matched when the match was in the body.
function ResultRow({
  value,
  entity,
  snippet,
  space,
  terms,
  onOpen,
}: {
  value: string;
  entity: { title: string; type: string; icon: string | null; key: string };
  snippet?: string | null;
  space: Space | undefined;
  terms: string;
  onOpen: () => void;
}) {
  const label = displayTitle(entity);
  return (
    <SpotlightItem value={value} onSelect={onOpen}>
      <EntityIcon entity={entity} size={16} className="shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">
          <Highlighted segments={termSegments(label, terms)} />
        </span>
        {snippet && (
          <span className="truncate text-xs text-muted-foreground">
            <Highlighted segments={snippetSegments(snippet)} />
          </span>
        )}
      </span>
      <EntityKey entityKey={entity.key} />
      {space && (
        <span className="flex max-w-36 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <SpaceGlyph space={space} size={12} />
          <span className="truncate">{space.name}</span>
        </span>
      )}
    </SpotlightItem>
  );
}

function FilterChip({ chip, onRemove }: { chip: SearchChip; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      // Keep the typing focus in the box.
      onMouseDown={(e) => e.preventDefault()}
      className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground hover:bg-secondary/70"
    >
      {chipText(chip)}
      <IconX size={12} aria-hidden="true" />
      <span className="sr-only">Remove filter</span>
    </button>
  );
}

function TypeTabs({ index, onChange }: { index: number; onChange: (index: number) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Result type"
      className="flex gap-1 overflow-x-auto border-b border-border/70 px-4 py-2"
    >
      {["All", ...SEARCH_TABS.map((t) => t.label)].map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          // Tab inside the box cycles these, so they stay out of the focus order.
          tabIndex={-1}
          aria-selected={i === index}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(i)}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs",
            i === index
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FilterHints() {
  return (
    <p className="px-3 py-2 text-xs text-muted-foreground">
      Type <Kbd>in:</Kbd> to search one Space, or <Kbd>#</Kbd> to filter by label.
    </p>
  );
}
