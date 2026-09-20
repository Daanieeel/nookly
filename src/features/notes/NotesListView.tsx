import { IconNotes, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { listEntities } from "@/lib/api/entities";
import { createNote } from "@/lib/api/notes";
import { useNavStore } from "@/lib/store/nav";

/// Notes are a page index, not a form (§2.3/§3.3) — creating one is a single quiet
/// affordance that drops straight into the canvas, title-first inside the page itself.
export function NotesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);

  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });
  const notes = entities.filter((e) => e.type === "note");

  const create = useMutation({
    mutationFn: () => createNote(spaceId, "Untitled"),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      openEntity(entity.id, spaceId);
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-1">
      <h1 className="mb-3 text-lg font-semibold">Notes</h1>
      <button
        type="button"
        onClick={() => create.mutate()}
        disabled={create.isPending}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <IconPlus size={15} className="shrink-0" />
        New page
      </button>
      <div className="mt-2 flex flex-col">
        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => openEntity(note.id, spaceId)}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <EntityIcon entity={note} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{note.title}</span>
          </button>
        ))}
        {notes.length === 0 && (
          <EmptyState
            icon={IconNotes}
            title="No pages yet"
            description='Use "New page" above to write your first one.'
          />
        )}
      </div>
    </div>
  );
}
