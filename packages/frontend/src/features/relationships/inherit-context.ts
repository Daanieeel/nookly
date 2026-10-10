import type { QueryClient } from "@tanstack/react-query";
import { createRelationship, listRelationships } from "#/lib/api/relationships.ts";
import { qk } from "#/lib/query-keys.ts";

/// Links that mean "this page lives inside that session, course or semester".
const CONTEXT_LINKS = new Set([
  "session-note",
  "session-jot",
  "course-notes",
  "course-jots",
  "course-note",
  "semester-notes",
  "relates-to",
]);

/// A file imported through a page is attached to the page and to every context the
/// page is linked to, so it shows up with that session or course too.
export async function inheritPageContext(client: QueryClient, pageId: string, fileId: string) {
  const links = await listRelationships(pageId, "both");
  const owners = new Set([pageId]);
  for (const link of links) {
    if (!CONTEXT_LINKS.has(link.relationshipType)) continue;
    owners.add(link.fromEntityId === pageId ? link.toEntityId : link.fromEntityId);
  }
  await Promise.all([...owners].map((owner) => createRelationship(owner, fileId, "attached-file")));
  await client.invalidateQueries({ queryKey: qk.relationships.of(fileId) });
}
