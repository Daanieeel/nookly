import type { QueryClient } from "@tanstack/react-query";
import { createNote } from "@/lib/api/notes";
import { createRelationship, listRelationships } from "@/lib/api/relationships";
import { linkSessionPage } from "@/lib/api/sessions";
import type { Entity } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";

/// A new Note in the Jot's Space, titled like it and linked back through the
/// generic `relates-to` relationship, which is all "refined" means (§ Jots). The
/// body starts empty: the Jot stays the raw capture, the Note is its rewrite.
/// A Jot written for a Session hands the Note to that Session too, unless it
/// already has one. Opens the Note once linked.
export async function refineJotIntoNote(jot: Entity, queryClient: QueryClient): Promise<Entity> {
  const note = await createNote(jot.spaceId, jot.title);
  await createRelationship(jot.id, note.id, "relates-to");
  const sessionLink = (await listRelationships(jot.id, "to")).find(
    (r) => r.relationshipType === "session-jot",
  );
  if (sessionLink) {
    await linkSessionPage(sessionLink.fromEntityId, "note", note.id);
    await queryClient.invalidateQueries({
      queryKey: ["session-pages", sessionLink.fromEntityId],
    });
  }
  await Promise.all([
    // Also covers both lists' summaries, which live under this key.
    queryClient.invalidateQueries({ queryKey: ["entities", jot.spaceId] }),
    queryClient.invalidateQueries({ queryKey: ["relationships", jot.id] }),
    queryClient.invalidateQueries({ queryKey: ["unrefined-jots"] }),
  ]);
  useNavStore.getState().openEntity(note.id, note.spaceId);
  return note;
}
