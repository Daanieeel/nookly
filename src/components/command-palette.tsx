import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { iconForType } from "@/components/entity-icon";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { search } from "@/lib/api/search";
import { listSpaces } from "@/lib/api/spaces";
import { useNavStore } from "@/lib/store/nav";

/// Global Cmd+K (search/quick-nav) and Cmd+P (quick-open) — same palette (§9).
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openEntity, setView } = useNavStore();
  const [query, setQuery] = useState("");
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const { data: hits = [] } = useQuery({
    queryKey: ["search", query],
    queryFn: () => search(query),
    enabled: query.trim().length > 0,
  });

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
  }, [paletteOpen]);

  return (
    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <Command className="flex flex-col" shouldFilter={false}>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
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
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: space.color }}
                    />
                    {space.name}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : (
              <>
                <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No results.
                </Command.Empty>
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
                      <span className="min-w-0 flex-1 truncate">{hit.title}</span>
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
