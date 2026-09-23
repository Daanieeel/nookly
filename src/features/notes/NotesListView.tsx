import { IconNotes, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusButtonContent, statusOf, statusTextClass } from "@/components/action-feedback";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { listEntities } from "@/lib/api/entities";
import { createNote } from "@/lib/api/notes";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { prefetchBlocks } from "./blocks-query";

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

  const createStatus = statusOf(create);

  return (
    <div className="flex max-w-2xl flex-col gap-1">
      <h1 className="mb-3 text-lg font-semibold">Notes</h1>
      <button
        type="button"
        onClick={() => !create.isPending && create.mutate()}
        className={cn(
          "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
          statusTextClass(createStatus),
        )}
      >
        <StatusButtonContent
          status={createStatus}
          icon={<IconPlus size={15} className="shrink-0" />}
          label="New page"
          errorLabel="Couldn't create page, try again"
        />
      </button>
      <div className="mt-2 flex flex-col">
        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => openEntity(note.id, spaceId)}
            onMouseEnter={() => prefetchBlocks(queryClient, note.id)}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <EntityIcon entity={note} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{displayTitle(note)}</span>
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
