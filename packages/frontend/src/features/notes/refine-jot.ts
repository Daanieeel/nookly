import { qk } from "#/lib/query-keys.ts";
import type { QueryClient } from "@tanstack/react-query";
import { createNote } from "#/lib/api/notes.ts";
import { createRelationship, listRelationships } from "#/lib/api/relationships.ts";
import { linkSessionPage } from "#/lib/api/sessions.ts";
import type { Entity } from "#/lib/api/types.ts";
import { tabGroups, useNavStore } from "#/lib/store/nav.ts";
import { canSplitRight } from "#/lib/store/tab-groups.ts";

/// Shows the Jot and the Note side by side, so the Jot can be read while the Note is
/// written. The Jot stays where it is when it is already open, or opens first when
/// another page is; the Note takes the group beside it, and has the focus.
function openBesideJot(jot: Entity, note: Entity) {
  const { view, openEntity } = useNavStore.getState();
  if (view.kind !== "entity" || view.entityId !== jot.id) openEntity(jot.id, jot.spaceId);
  const nav = useNavStore.getState();
  const layout = { groups: tabGroups(nav), focusedGroupId: nav.focusedGroupId };
  // The rightmost group has nothing on its right, so the Note goes to its left.
  if (canSplitRight(layout, nav.activeTabId)) nav.splitRight();
  else nav.splitLeft();
  useNavStore.getState().openEntity(note.id, note.spaceId);
}

/// A new Note in the Jot's Space, titled like it and linked back through the
/// generic `relates-to` relationship, which is all "refined" means (§ Jots). The
/// body starts empty: the Jot stays the raw capture, the Note is its rewrite.
/// A Jot written for a Session hands the Note to that Session too, unless it
/// already has one. Opens the Note beside the Jot once linked.
export async function refineJotIntoNote(jot: Entity, queryClient: QueryClient): Promise<Entity> {
  const note = await createNote(jot.spaceId, jot.title);
  await createRelationship(jot.id, note.id, "relates-to");
  const sessionLink = (await listRelationships(jot.id, "to")).find(
    (r) => r.relationshipType === "session-jot",
  );
  if (sessionLink) {
    await linkSessionPage(sessionLink.fromEntityId, "note", note.id);
    await queryClient.invalidateQueries({
      queryKey: qk.sessions.pages(sessionLink.fromEntityId),
    });
  }
  await Promise.all([
    // Also covers both lists' summaries, which live under this key.
    queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(jot.spaceId) }),
    queryClient.invalidateQueries({ queryKey: qk.relationships.of(jot.id) }),
    queryClient.invalidateQueries({ queryKey: qk.jots.unrefined }),
  ]);
  openBesideJot(jot, note);
  return note;
}
