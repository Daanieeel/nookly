import { type MentionTarget, parseMentionHref } from "#/features/relationships/mention-utils.ts";

/// `nookly://open/<entity>` and `nookly://open/<entity>#<block>`: a link that opens Nookly on
/// an entity or a block from outside the app. The link comes from outside and is untrusted: it
/// is parsed strictly, it only navigates, and it never creates, edits or deletes anything. It
/// carries local ids, so it only works on the computer and database it was copied from.
const DEEP_LINK = /^nookly:\/\/open\/([A-Za-z0-9-]{1,64})(?:#([A-Za-z0-9_-]{1,1000}))?$/i;

/// What the link points at, or `null` for anything that is not an exact Nookly link.
export function parseDeepLink(url: string): MentionTarget | null {
  const match = DEEP_LINK.exec(url.trim());
  if (!match) return null;
  const [, entity, fragment] = match;
  return parseMentionHref(fragment ? `mention:${entity}#${fragment}` : `mention:${entity}`);
}

/// The link to an entity, or one block of a page.
export function deepLinkFor(entityId: string, blockId?: string): string {
  return `nookly://open/${entityId}${blockId ? `#${blockId}` : ""}`;
}
