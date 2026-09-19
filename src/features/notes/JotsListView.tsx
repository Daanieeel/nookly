import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listEntities } from "@/lib/api/entities";
import { createJot, createRefinement } from "@/lib/api/notes";
import { useNavStore } from "@/lib/store/nav";

/// Jots (raw capture) and Refinements (polished version), §5.3 — two distinct page
/// types shown together, linked afterwards via the generic relationship system
/// rather than a rigid 1:1 pairing.
export function JotsListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");

  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });
  const pages = entities.filter((e) => e.type === "jot" || e.type === "refinement");

  const createJotMut = useMutation({
    mutationFn: (t: string) => createJot(spaceId, t),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      setTitle("");
      openEntity(entity.id, spaceId);
    },
  });
  const createRefinementMut = useMutation({
    mutationFn: (t: string) => createRefinement(spaceId, t),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      setTitle("");
      openEntity(entity.id, spaceId);
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Jots & Refinements</h1>
      <div className="flex gap-2">
        <Input
          placeholder="Title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!title.trim()}
          onClick={() => createJotMut.mutate(title.trim())}
        >
          New Jot
        </Button>
        <Button
          size="sm"
          disabled={!title.trim()}
          onClick={() => createRefinementMut.mutate(title.trim())}
        >
          New Refinement
        </Button>
      </div>
      <div className="flex flex-col">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => openEntity(page.id, spaceId)}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <EntityIcon entity={page} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{page.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{page.type}</span>
          </button>
        ))}
        {pages.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        )}
      </div>
    </div>
  );
}
