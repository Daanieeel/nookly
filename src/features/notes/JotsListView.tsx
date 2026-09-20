import { IconPlus, IconWriting } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listEntities } from "@/lib/api/entities";
import { createBlock, createJot, createRefinement } from "@/lib/api/notes";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

function titleFromContent(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.slice(0, 80) || "Untitled Jot";
}

/// Jots (raw capture) and Refinements (polished version), §5.3 — two distinct page
/// types shown together, linked afterwards via the generic relationship system
/// rather than a rigid 1:1 pairing. A Jot wants near-zero friction (§3.3): no title
/// field up front, just a big capture box that saves the whole thought on Enter.
export function JotsListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [content, setContent] = useState("");

  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });
  const pages = entities.filter((e) => e.type === "jot" || e.type === "refinement");

  const createJotMut = useMutation({
    mutationFn: async () => {
      const entity = await createJot(spaceId, titleFromContent(content));
      const trimmed = content.trim();
      if (trimmed) await createBlock(entity.id, "paragraph", trimmed);
      return entity;
    },
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      setContent("");
      openEntity(entity.id, spaceId);
    },
  });
  const createRefinementMut = useMutation({
    mutationFn: () => createRefinement(spaceId, "Untitled Refinement"),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      openEntity(entity.id, spaceId);
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Jots & Refinements</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (content.trim()) createJotMut.mutate();
        }}
        className="flex flex-col gap-2"
      >
        <Textarea
          placeholder="Jot something down…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (content.trim()) createJotMut.mutate();
            }
          }}
          rows={3}
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => createRefinementMut.mutate()}
            disabled={createRefinementMut.isPending}
            className="flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <IconPlus size={12} /> New Refinement
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Enter to save · Shift+Enter for a new line
            </span>
            <Button type="submit" size="sm" disabled={!content.trim() || createJotMut.isPending}>
              Save Jot
            </Button>
          </div>
        </div>
      </form>

      <div className="flex flex-col">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => openEntity(page.id, spaceId)}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <EntityIcon entity={page} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{displayTitle(page)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{page.type}</span>
          </button>
        ))}
        {pages.length === 0 && (
          <EmptyState
            icon={IconWriting}
            title="Nothing captured yet"
            description="Jot down a quick thought above — refine it into something polished later."
          />
        )}
      </div>
    </div>
  );
}
