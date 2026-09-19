import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listEntities } from "@/lib/api/entities";
import { createNote } from "@/lib/api/notes";
import { useNavStore } from "@/lib/store/nav";

export function NotesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");

  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });
  const notes = entities.filter((e) => e.type === "note");

  const create = useMutation({
    mutationFn: (t: string) => createNote(spaceId, t),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      setTitle("");
      openEntity(entity.id, spaceId);
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Notes</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate(title.trim());
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="New note title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9"
        />
        <Button type="submit" size="sm">
          Create
        </Button>
      </form>
      <div className="flex flex-col">
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
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notes yet.</p>
        )}
      </div>
    </div>
  );
}
