import type { QueryClient } from "@tanstack/react-query";
import { notify } from "#/components/notify.tsx";
import { createNote } from "#/lib/api/notes.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// The New Page shortcut and command: an untitled note in the Space the sidebar shows,
/// opened with its title focused. With no Space yet it does nothing.
export async function startNewPage(queryClient: QueryClient): Promise<void> {
  try {
    const spaces = await queryClient.fetchQuery({ queryKey: qk.spaces, queryFn: listSpaces });
    const { activeSpaceId, openEntity } = useNavStore.getState();
    const space = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
    if (!space) return;
    // An empty title so the canvas opens with the title field focused and ready to type.
    const note = await createNote(space.id, "");
    void queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(space.id) });
    void queryClient.invalidateQueries({ queryKey: qk.spaceModules(space.id) });
    openEntity(note.id, space.id);
  } catch {
    // The palette or the shortcut left nothing on screen to carry the failure.
    notify.error("Couldn't create the page", { description: "Try again." });
  }
}
