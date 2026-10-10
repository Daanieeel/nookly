import type { QueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { importPageJson } from "#/lib/api/notes.ts";
import type { Entity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";

/// Asks for a Nookly page file and imports it as a new page in the Space. Resolves to
/// `null` when the user cancels the dialog. The page is new every time: an existing
/// page is never changed.
export async function importPageFromFile(
  spaceId: string,
  queryClient: QueryClient,
): Promise<Entity | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Nookly page", extensions: ["json"] }],
  });
  if (!path) return null;
  const entity = await importPageJson(spaceId, path);
  // Every list keyed by this Space (notes, jots, entities) gains the page.
  void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(entity.spaceId) });
  void queryClient.invalidateQueries({ queryKey: qk.entities.all });
  return entity;
}

/// Why an import failed, in the backend's own words when it gave any (a rejected command
/// carries the backend error, which has a `message`).
export function importFailureReason(error: { message?: string }): string {
  return error.message || "Couldn't import the page.";
}
