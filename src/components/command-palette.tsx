import { Command } from "cmdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { iconForType } from "@/components/entity-icon";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createCourse } from "@/lib/api/courses";
import type { Entity } from "@/lib/api/types";
import { createJot, createNote, createRefinement } from "@/lib/api/notes";
import { search } from "@/lib/api/search";
import { listSpaces } from "@/lib/api/spaces";
import { createTask } from "@/lib/api/tasks";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

/// Entity types simple enough to be created directly from the palette with just a
/// title (§3.2/§9 — "typing task: jumps straight into task creation"). Anything
/// requiring more context (Exam, Assignment, Session, Bookmark, File…) is a jump
/// to that module's own tailored creation surface instead, not a bare title field.
/// Each still goes through its real create_* command (not the bare generic entity
/// insert) since Tasks/Courses also need a matching row in their own table.
const QUICK_CREATE_TYPES: {
  type: string;
  label: string;
  create: (spaceId: string, title: string) => Promise<Entity>;
}[] = [
  {
    type: "task",
    label: "Task",
    create: (s, t) => createTask(s, t, null, null).then((r) => r.entity),
  },
  { type: "note", label: "Note", create: createNote },
  { type: "jot", label: "Jot", create: createJot },
  { type: "refinement", label: "Refinement", create: createRefinement },
  { type: "course", label: "Course", create: createCourse },
];

interface QuickCreateMatch {
  type: string;
  label: string;
  title: string;
  create: (spaceId: string, title: string) => Promise<Entity>;
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

/// Global Cmd+K (search/quick-nav) and Cmd+P (quick-open) — same palette (§9).
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openEntity, setView, activeSpaceId } = useNavStore();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const { data: hits = [] } = useQuery({
    queryKey: ["search", query],
    queryFn: () => search(query),
    enabled: query.trim().length > 0,
  });

  const quickCreate = useMutation({
    mutationFn: (vars: {
      create: (spaceId: string, title: string) => Promise<Entity>;
      title: string;
    }) =>
      // SAFETY: `createMatches` (the only source of `vars`) is gated on `activeSpaceId`
      // being set, so this mutation is never invoked while it's null.
      vars.create(activeSpaceId as string, vars.title),
    onSuccess: (entity) => {
      // Invalidate every cached list keyed by this Space (["entities", id], ["tasks", id],
      // ["courses", id], …) rather than guessing which one this entity type feeds.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.includes(entity.spaceId),
      });
      openEntity(entity.id, entity.spaceId);
      setPaletteOpen(false);
    },
  });

  const trimmed = query.trim();
  const createMatches = activeSpaceId ? matchQuickCreate(trimmed) : [];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "p")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (!paletteOpen) setQuery("");
    else inputRef.current?.focus();
  }, [paletteOpen]);

  return (
    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <Command className="flex flex-col" shouldFilter={false}>
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Search, jump to a Space, or open anything…"
            className="h-11 border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-96 overflow-y-auto p-1">
            {query.trim().length === 0 ? (
              <Command.Group heading="Spaces" className="px-2 py-1.5 text-xs text-muted-foreground">
                {spaces.map((space) => (
                  <Command.Item
                    key={space.id}
                    value={space.id}
                    onSelect={() => {
                      setView({ kind: "module", spaceId: space.id, module: "tasks" });
                      setPaletteOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                  >
                    <span
                      className="inline-block size-2 rounded-full bg-(--space-color)"
                      // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
                      style={{ "--space-color": space.color } as CSSProperties}
                    />
                    {space.name}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : (
              <>
                {createMatches.length > 0 && (
                  <Command.Group
                    heading="Create"
                    className="px-2 py-1.5 text-xs text-muted-foreground"
                  >
                    {createMatches.map((m) => {
                      const Icon = iconForType(m.type);
                      return (
                        <Command.Item
                          key={m.type}
                          value={`create-${m.type}`}
                          onSelect={() =>
                            quickCreate.mutate({
                              create: m.create,
                              title: m.title || `Untitled ${m.label}`,
                            })
                          }
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                        >
                          <Icon size={16} className="shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate">
                            New {m.label}
                            {m.title ? `: ${m.title}` : "…"}
                          </span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}
                {hits.length === 0 && createMatches.length === 0 && (
                  <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No results.
                  </Command.Empty>
                )}
                {hits.map((hit) => {
                  const Icon = iconForType(hit.type);
                  return (
                    <Command.Item
                      key={hit.entityId}
                      value={hit.entityId}
                      onSelect={() => {
                        openEntity(hit.entityId, hit.spaceId);
                        setPaletteOpen(false);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                    >
                      <Icon size={16} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{displayTitle(hit)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{hit.type}</span>
                    </Command.Item>
                  );
                })}
              </>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
